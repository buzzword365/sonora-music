// Two-deck, local-only audio engine. The Web Audio graph is created on the
// first user playback gesture to satisfy Chromium/macOS autoplay requirements.
export type EQBands = { bass:number; mid:number; treble:number };

export class AudioMixer {
  readonly first = new Audio();
  readonly second = new Audio();
  current:HTMLAudioElement = this.first;
  standby:HTMLAudioElement = this.second;
  private ctx:AudioContext|null = null;
  private gains = new Map<HTMLAudioElement,GainNode>();
  private low:BiquadFilterNode|null = null;
  private sub:BiquadFilterNode|null = null;
  private middle:BiquadFilterNode|null = null;
  private high:BiquadFilterNode|null = null;
  private dry:GainNode|null = null;
  private protectedGain:GainNode|null = null;
  private eqEnabled=false;
  private eq:EQBands={bass:0,mid:0,treble:0};
  private volume=.76;
  private muted=false;
  private owned = new Map<HTMLAudioElement,string>();
  private fadeTimer:ReturnType<typeof setTimeout>|null=null;
  private fadePending=false;
  isCrossfading=false;
  constructor(){
    this.first.preload='auto';
    this.second.preload='auto';
  }
  async unlock(){
    if(!this.ctx){
      const ctx=new AudioContext();
      this.ctx=ctx;
      const low=ctx.createBiquadFilter(),sub=ctx.createBiquadFilter(),mid=ctx.createBiquadFilter(),high=ctx.createBiquadFilter();
      low.type='lowshelf';low.frequency.value=160;
      // Add controlled low-bass punch without excessively boosting the vocal range.
      sub.type='peaking';sub.frequency.value=65;sub.Q.value=.85;
      mid.type='peaking';mid.frequency.value=1000;mid.Q.value=.8;
      high.type='highshelf';high.frequency.value=4200;
      // Peak compression reduces overload risk at high positive EQ settings.
      const compressor=ctx.createDynamicsCompressor();
      compressor.threshold.value=-4;compressor.knee.value=2;
      compressor.ratio.value=12;compressor.attack.value=.003;compressor.release.value=.18;
      // Flat/off EQ follows the uncompressed path; boosted EQ uses the protective compressor.
      const dry=ctx.createGain(),protectedGain=ctx.createGain();
      dry.gain.value=1;protectedGain.gain.value=0;
      low.connect(sub);sub.connect(mid);mid.connect(high);
      high.connect(dry);dry.connect(ctx.destination);
      high.connect(compressor);compressor.connect(protectedGain);protectedGain.connect(ctx.destination);
      this.low=low;this.sub=sub;this.middle=mid;this.high=high;this.dry=dry;this.protectedGain=protectedGain;
      for(const deck of [this.first,this.second]){
        const source=ctx.createMediaElementSource(deck);
        const gain=ctx.createGain();
        source.connect(gain);gain.connect(low);
        gain.gain.value=deck===this.current?1:0;
        this.gains.set(deck,gain);
      }
      this.applyEQ();
      this.setVolume(this.volume,this.muted);
    }
    if(this.ctx.state==='suspended')await this.ctx.resume();
  }
  setEQ(enabled:boolean,values:EQBands){
    this.eqEnabled=enabled;this.eq=values;this.applyEQ();
  }
  private applyEQ(){
    if(!this.ctx||!this.low||!this.sub||!this.middle||!this.high||!this.dry||!this.protectedGain)return;
    const t=this.ctx.currentTime;
    const levels=this.eqEnabled?this.eq:{bass:0,mid:0,treble:0};
    const boosted=this.eqEnabled&&[levels.bass,levels.mid,levels.treble].some(value=>value>0);
    this.dry.gain.setTargetAtTime(boosted?0:1,t,.02);
    this.protectedGain.gain.setTargetAtTime(boosted?1:0,t,.02);
    for(const [node,gain] of [[this.low,levels.bass],[this.sub,Math.max(0,levels.bass)*.3],[this.middle,levels.mid],[this.high,levels.treble]] as const)
      node.gain.setTargetAtTime(gain,t,.04);
  }
  setVolume(value:number,muted:boolean){
    this.volume=Math.max(0,Math.min(1,value));this.muted=muted;
    this.first.volume=this.muted?0:this.volume;
    this.second.volume=this.muted?0:this.volume;
  }
  private clear(deck:HTMLAudioElement){
    deck.pause();deck.removeAttribute('src');deck.load();
    const owned=this.owned.get(deck);
    if(owned){URL.revokeObjectURL(owned);this.owned.delete(deck);}
  }
  private attach(deck:HTMLAudioElement,src:string,owned:boolean){
    this.clear(deck);
    deck.src=src;deck.load();
    if(owned)this.owned.set(deck,src);
  }
  loadCurrent(src:string,owned=false){
    this.cancelFade();
    this.attach(this.current,src,owned);
    if(this.ctx){
      this.gains.get(this.current)?.gain.setValueAtTime(1,this.ctx.currentTime);
      this.gains.get(this.standby)?.gain.setValueAtTime(0,this.ctx.currentTime);
    }
  }
  async crossfadeTo(src:string,seconds:number,onComplete:()=>void,owned=false){
    if(this.fadePending || this.isCrossfading || seconds<=0)return false;
    this.fadePending=true;
    const from=this.current,to=this.standby;
    try{
      await this.unlock();
      if(!this.fadePending)return false;
      this.attach(to,src,owned);this.setVolume(this.volume,this.muted);
      const ctx=this.ctx!;
      const oldGain=this.gains.get(from)!.gain,newGain=this.gains.get(to)!.gain;
      oldGain.cancelScheduledValues(ctx.currentTime);oldGain.setValueAtTime(1,ctx.currentTime);
      newGain.cancelScheduledValues(ctx.currentTime);newGain.setValueAtTime(0,ctx.currentTime);
      await to.play();
      if(!this.fadePending)return false;
      const now=ctx.currentTime;
      // Equal-power approximated with interleaved gain automation points.
      const steps=20;
      for(let i=1;i<=steps;i++){
        const t=i/steps;
        oldGain.linearRampToValueAtTime(Math.cos(t*Math.PI/2),now+t*seconds);
        newGain.linearRampToValueAtTime(Math.sin(t*Math.PI/2),now+t*seconds);
      }
      this.fadePending=false;this.isCrossfading=true;
      this.fadeTimer=setTimeout(()=>{
        this.fadeTimer=null;this.isCrossfading=false;
        this.clear(from);
        this.current=to;this.standby=from;
        oldGain.cancelScheduledValues(ctx.currentTime);oldGain.setValueAtTime(0,ctx.currentTime);
        newGain.cancelScheduledValues(ctx.currentTime);newGain.setValueAtTime(1,ctx.currentTime);
        onComplete();
      },seconds*1000);
      return true;
    }catch(err){
      this.fadePending=false;this.cancelFade();
      return false;
    }
  }
  cancelFade(){
    this.fadePending=false;
    if(this.fadeTimer){clearTimeout(this.fadeTimer);this.fadeTimer=null;}
    if(this.isCrossfading || this.standby.src)this.clear(this.standby);
    this.isCrossfading=false;
    if(this.ctx){
      for(const [deck,gain] of this.gains){
        gain.gain.cancelScheduledValues(this.ctx.currentTime);
        gain.gain.setValueAtTime(deck===this.current?1:0,this.ctx.currentTime);
      }
    }
  }
  dispose(){
    this.cancelFade();this.clear(this.first);this.clear(this.second);
    if(this.ctx)void this.ctx.close();
  }
}
