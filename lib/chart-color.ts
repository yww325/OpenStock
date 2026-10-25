// The chart library reads colours as plain rgb values, but the app's palette is written in oklch
// and the browser keeps those values as they are. So a colour is painted on a one pixel canvas
// and read back as red, green and blue; this turns those four numbers into the string the
// library expects.

export const formatRgba = (r: number, g: number, b: number, a: number): string => {
    const alpha = Math.round((a / 255) * 1000) / 1000;
    return alpha >= 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
};
