/**
 * Electron uses display-independent screen coordinates for both windows and
 * cursor positions. Only the built-in display's top-center sensor area triggers.
 */
export function notchPopupBounds(display) {
  const width=340,height=116;
  const top=Math.max(display.bounds.y+30,display.workArea.y+4);
  const center=display.bounds.x+display.bounds.width/2;
  return {x:Math.round(center-width/2),y:Math.round(top),width,height};
}
export function inNotchHoverZone(point,display) {
  if(!point||!display)return false;
  const middle=display.bounds.x+display.bounds.width/2;
  const top=display.bounds.y;
  const height=Math.max(32,display.workArea.y-top+6);
  return Math.abs(point.x-middle)<=105 && point.y>=top && point.y<=top+height;
}
export function inPopupZone(point,rect){
  return point.x>=rect.x-10 && point.x<=rect.x+rect.width+10 &&
    point.y>=rect.y-12 && point.y<=rect.y+rect.height+9;
}
