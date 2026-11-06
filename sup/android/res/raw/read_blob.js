// One-shot read of a user-requested JSON download in its originating page.
// Synchronous XHR returns the text to evaluateJavascript's existing callback
// before the website revokes its short-lived blob URL. No native bridge is exposed.
(() => {
  try {
    const request = new XMLHttpRequest();
    request.open("GET", __BLOB_URL__, false);
    request.overrideMimeType("text/plain;charset=UTF-8");
    request.send();
    return request.status === 200 ? request.responseText : null;
  } catch (_) {
    return null;
  }
})()
