const TODAY_STYLE_KEY = 'movers.todayStyle';
const OVERALL_STYLE_KEY = 'movers.overallStyle';

export const VIS_STYLES = { HEAT: 'heat', BUBBLE: 'bubble' };

export function getTodayStyle() {
  return localStorage.getItem(TODAY_STYLE_KEY) === VIS_STYLES.BUBBLE ? VIS_STYLES.BUBBLE : VIS_STYLES.HEAT;
}
export function setTodayStyle(style) {
  localStorage.setItem(TODAY_STYLE_KEY, style);
}

export function getOverallStyle() {
  return localStorage.getItem(OVERALL_STYLE_KEY) === VIS_STYLES.HEAT ? VIS_STYLES.HEAT : VIS_STYLES.BUBBLE;
}
export function setOverallStyle(style) {
  localStorage.setItem(OVERALL_STYLE_KEY, style);
}
