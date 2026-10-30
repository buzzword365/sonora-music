import { Check, Layers3, Sparkles } from 'lucide-react';

export type SurfaceTheme='default'|'glass';

export default function ThemePicker({
  value, onChange
}:{
  value:SurfaceTheme;
  onChange:(theme:SurfaceTheme)=>void;
}){
  return (
    <section className="setting-card theme-picker" aria-labelledby="theme-picker-title">
      <div className="theme-picker-heading">
        <div className="setting-icon theme-picker-icon"><Layers3 size={24}/></div>
        <div>
          <div className="appearance-kicker">THE FEEL OF YOUR PLAYER</div>
          <h3 id="theme-picker-title">Theme</h3>
          <p>Choose the materials around your music. Song titles and album covers stay perfectly clear.</p>
        </div>
        <span className="theme-picker-status"><Sparkles size={14}/> Instant preview</span>
      </div>
      <div className="theme-picker-options" role="group" aria-label="Sonora theme">
        {([
          {id:'default',name:'Default',description:'The original Sonora. Clean, quiet and colourful.'},
          {id:'glass',name:'Liquid Glass',description:'Softly frosted layers, luminous edges and translucent controls.'}
        ] as const).map(theme=>
          <button
            type="button"
            key={theme.id}
            className={'theme-picker-option'+(value===theme.id?' is-selected':'')}
            data-testid={'theme-'+theme.id}
            aria-pressed={value===theme.id}
            onClick={()=>onChange(theme.id)}
          >
            <span className={'theme-picker-preview theme-preview-'+theme.id} aria-hidden="true">
              <span className="theme-preview-orb orb-a"/>
              <span className="theme-preview-orb orb-b"/>
              <span className="theme-preview-sidebar">
                <i/><i/><i/>
              </span>
              <span className="theme-preview-window">
                <span className="theme-preview-art"/>
                <span className="theme-preview-lines"><i/><i/><i/></span>
              </span>
              <span className="theme-preview-player">
                <i/><i/><i/>
              </span>
            </span>
            <span className="theme-picker-information">
              <span className="theme-picker-title">{theme.name} {value===theme.id&&<span className="theme-picker-check"><Check size={13} strokeWidth={3}/></span>}</span>
              <span className="theme-picker-description">{theme.description}</span>
            </span>
          </button>
        )}
      </div>
      <p className="theme-picker-footnote">Your theme is saved locally and applied across Sonora. Existing music and playlists are unchanged.</p>
    </section>
  );
}
