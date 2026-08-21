export function addStroke(stroke) {
  state.drawing.strokes.push(stroke);
  renderDrawing();
}

export function undoStroke() {
  state.drawing.strokes.pop();
  renderDrawing();
}

export function clearDrawing() {
  state.drawing.strokes.length = 0;
  renderDrawing();
}