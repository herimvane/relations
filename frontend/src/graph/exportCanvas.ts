export function exportCanvas(canvas: HTMLCanvasElement | null, filename = 'relation-nebula.png') {
  if (!canvas) return;
  const link = document.createElement('a');
  link.href = canvas.toDataURL('image/png');
  link.download = filename;
  link.click();
}
