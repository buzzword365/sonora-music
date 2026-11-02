/**
 * Compact glass island with no fake camera-tab protrusion.
 * Place the card at the first safe content point below the macOS menu bar.
 * Coordinates are Electron device-independent screen points.
 */
export const NOTCH_WIDTH=308;
export const NOTCH_HEIGHT=134;
export function notchPopupBounds(display) {
  const width=Math.min(NOTCH_WIDTH,Math.max(260,display.bounds.width-24));
  const height=NOTCH_HEIGHT;
  const center=display.bounds.x+display.bounds.width/2;
  // Leave the actual system/menu strip untouched: the glass card attaches
  // visually to its lower edge, rather than drawing an extra camera tab.
  const top=Math.max(display.bounds.y+33,display.workArea.y);
  return {x:Math.round(center-width/2),y:Math.round(top),width,height};
}
export function inNotchHoverZone(point,display){
  if(!point||!display)return false;
  const middle=display.bounds.x+display.bounds.width/2;
  // Open when entering the area just *below* the camera/menu bar, rather
  // than needing to hit a narrow 31-point strip between polling ticks.
  // The physical top edge is intentionally not the initial trigger.
  const menuBottom=Math.max(display.bounds.y+29,display.workArea.y);
  return Math.abs(point.x-middle)<=120 &&
    point.y>=menuBottom && point.y<=menuBottom+72;
}
export function inNotchKeepAliveZone(point,display){
  if(!point||!display)return false;
  const middle=display.bounds.x+display.bounds.width/2;
  const top=display.bounds.y;
  const menuBottom=Math.max(top+29,display.workArea.y);
  // Once opened, crossing from the activation strip to the camera/top edge
  // must NOT dismiss the player. This is distinct from the opening zone so
  // a pass over the very top of the menu bar will not open it from cold.
  return Math.abs(point.x-middle)<=140 &&
    point.y>=top-3 && point.y<=menuBottom+80;
}
export function isNotchHovered(point,display,popupBounds,isVisible=false){
  return inNotchHoverZone(point,display) ||
    (Boolean(isVisible) && (
      inNotchKeepAliveZone(point,display) || inPopupZone(point,popupBounds)
    ));
}
export function inPopupZone(point,rect){
  if(!point||!rect)return false;
  // Expanded panel extends down from the camera cutout. Margin permits
  // short moves between the physical notch and the panel.
  return point.x>=rect.x-8 && point.x<=rect.x+rect.width+8 &&
    point.y>=rect.y-8 && point.y<=rect.y+rect.height+12;
}
