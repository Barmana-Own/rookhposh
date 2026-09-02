export function downloadBlob(blob, filename) {
  const fileBlob = blob instanceof Blob ? blob : new Blob([blob]);
  const url = window.URL.createObjectURL(fileBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}
