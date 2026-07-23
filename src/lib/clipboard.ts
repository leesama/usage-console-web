function fallbackCopyText(text: string): void {
  const input = document.createElement("textarea");
  input.value = text;
  input.readOnly = true;
  input.style.position = "fixed";
  input.style.inset = "0 auto auto -9999px";
  input.style.opacity = "0";
  document.body.appendChild(input);
  input.focus();
  input.select();
  input.setSelectionRange(0, input.value.length);

  let copied = false;
  try {
    copied = document.execCommand("copy");
  } finally {
    input.remove();
  }

  if (!copied) {
    throw new Error("浏览器未允许写入剪贴板");
  }
}

export async function copyText(text: string): Promise<void> {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  fallbackCopyText(text);
}
