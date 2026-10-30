/** Fisher–Yates: one unbiased random order per Mix session, with no repeats. */
export function shuffledIds<T>(ids:readonly T[], random:()=>number=Math.random):T[] {
  const result=[...ids];
  for(let i=result.length-1;i>0;i--){
    const j=Math.min(i,Math.max(0,Math.floor(random()*(i+1))));
    [result[i],result[j]]=[result[j],result[i]];
  }
  return result;
}
