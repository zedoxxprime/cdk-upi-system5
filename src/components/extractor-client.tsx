"use client";

import { useEffect, useRef, useState } from "react";

const SESSION_URL = "https://chatgpt.com/api/auth/session";

type ExtractResponse = {
  ok: boolean;
  message?: string;
  data?: {
    qrImageUrl: string;
    upiUri: string;
    paymentUrl: string;
    expiresAt: string;
    checkoutSessionId: string;
    processorEntity: string;
    createdAt: string;
  };
};

type ExtractResult = NonNullable<ExtractResponse["data"]>;

function QrIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M7 7h13v13H7V7Zm21 0h13v13H28V7ZM7 28h13v13H7V28Z" stroke="currentColor" strokeWidth="3.4" strokeLinejoin="round" />
      <path d="M30 29h4v4h-4v-4Zm8 0h3v11H30v-3h8v-8Zm-14 7h4v5h-4v-5Z" fill="currentColor" />
      <path d="M12 12h3v3h-3v-3Zm21 0h3v3h-3v-3ZM12 33h3v3h-3v-3Z" fill="currentColor" />
    </svg>
  );
}

function formatRemainingTime(expiresAt?: string, now = Date.now()) {
  if (!expiresAt) return "";
  const ms = new Date(expiresAt).getTime() - now;
  if (!Number.isFinite(ms) || ms <= 0) return "二维码可能已过期";
  const total = Math.ceil(ms / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `约 ${minutes}:${String(seconds).padStart(2, "0")} 后过期`;
}

function getFriendlyError(message: string) {
  const text = message || "提取失败，请稍后重试。";
  if (text.includes("BillingCountryLockedError") || text.includes("账单地址") || text.toLowerCase().includes("billing country")) {
    return "账号地区已被 OpenAI 锁定，无法更改账单地址。";
  }
  if (text.includes("EmailBoundError") || text.includes("绑定邮箱")) {
    return "该账号已绑定邮箱，无法提取 UPI 二维码。";
  }
  return text.replace(/^Error:\s*/i, "").replace(/^(UpiQrUnavailableError|BillingCountryLockedError|EmailBoundError):\s*/i, "");
}

export function ExtractorClient() {
  const [credential, setCredential] = useState("");
  const [result, setResult] = useState<ExtractResult | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState<"session" | "upi" | "payment" | "">("");
  const [isLoading, setIsLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const credentialRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!result?.expiresAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [result?.expiresAt]);

  async function copyText(value: string, target: "session" | "upi" | "payment") {
    await navigator.clipboard.writeText(value);
    setCopied(target);
    window.setTimeout(() => setCopied(""), 1400);
  }

  async function submit() {
    const value = (credential || credentialRef.current?.value || "").trim();
    if (isLoading) return;
    if (!value) {
      setError("请输入 session token / cookie / session JSON。");
      return;
    }
    setIsLoading(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionToken: value }),
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json")
        ? ((await response.json()) as ExtractResponse)
        : ({ ok: false, message: `服务端返回非 JSON（HTTP ${response.status}）。` } satisfies ExtractResponse);

      if (!response.ok || !payload.ok || !payload.data) {
        throw new Error(payload.message || `提取失败（HTTP ${response.status}）。`);
      }

      setResult(payload.data);
      setCredential("");
      setNow(Date.now());
    } catch (err) {
      setError(getFriendlyError(err instanceof Error ? err.message : String(err)));
    } finally {
      setIsLoading(false);
    }
  }

  function reset() {
    setResult(null);
    setError("");
    setCopied("");
  }

  return (
    <main className="page-shell">
      <div className="extractor-wrap">
        <section className="hero" aria-labelledby="page-title">
          <div className="brand-mark"><QrIcon /></div>
          <h1 id="page-title">UPI 二维码提取</h1>
          <p className="hero-subtitle">
            粘贴 ChatGPT session token / cookie / session JSON，服务端会生成 UPI 二维码并返回 ChatGPT 支付链接。
          </p>
        </section>

        <section className="panel extractor-card">
          {result ? (
            <div className="result-view">
              <div className="qr-shell">
                <div className="qr-frame">
                  <img src={result.qrImageUrl} alt="UPI QR Code" />
                </div>
                <div className="expire-pill">{formatRemainingTime(result.expiresAt, now)}</div>
                <button className="btn btn-primary" type="button" onClick={reset}>提取新的 UPI 链接</button>
              </div>

              <div className="result-copy">
                <div className="result-title">
                  <h2>提取成功</h2>
                  <p>请尽快使用二维码或支付链接。UPI 二维码通常只有几分钟有效期，过期后需要重新提取。</p>
                </div>

                <div className="message success">二维码已生成，支付链接与 UPI URI 已在下方返回。</div>

                <div className="field-block">
                  <label>ChatGPT 支付链接</label>
                  <div className="copy-row">
                    <input className="url-input" readOnly value={result.paymentUrl} onFocus={(event) => event.currentTarget.select()} />
                    <button className="btn btn-soft" type="button" onClick={() => copyText(result.paymentUrl, "payment")}>{copied === "payment" ? "已复制" : "复制"}</button>
                  </div>
                </div>

                <div className="field-block">
                  <label>UPI URI</label>
                  <div className="copy-row">
                    <input className="url-input" readOnly value={result.upiUri} onFocus={(event) => event.currentTarget.select()} />
                    <button className="btn btn-soft" type="button" onClick={() => copyText(result.upiUri, "upi")}>{copied === "upi" ? "已复制" : "复制"}</button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="instructions">
                <h2>如何获取 Session Token</h2>
                <ol className="steps">
                  <li className="step"><span className="step-index">1</span><span>在浏览器打开 <a href="https://chatgpt.com/" target="_blank" rel="noreferrer">chatgpt.com</a> 并登录需要提取的账号。</span></li>
                  <li className="step"><span className="step-index">2</span><span>打开 session 页面，复制页面里显示的全部内容并粘贴到下方。</span></li>
                </ol>
                <div className="copy-row">
                  <span className="copy-url">{SESSION_URL}</span>
                  <button className="btn btn-soft" type="button" onClick={() => copyText(SESSION_URL, "session")}>{copied === "session" ? "已复制" : "复制地址"}</button>
                </div>
              </div>

              <div className="form-area">
                <label className="form-label" htmlFor="credential">
                  <span>Session Token / Cookie / Session JSON</span>
                  <span className="form-hint">固定输入框，不会在前端持久保存</span>
                </label>
                <textarea
                  id="credential"
                  className="token-input"
                  value={credential}
                  ref={credentialRef}
                  onChange={(event) => setCredential(event.currentTarget.value)}
                  onInput={(event) => setCredential(event.currentTarget.value)}
                  placeholder="粘贴 https://chatgpt.com/api/auth/session 页面内容，或粘贴浏览器 cookie / session token"
                  spellCheck={false}
                  disabled={isLoading}
                />

                {error ? <div className="message error" role="alert">{error}</div> : null}

                <div className="actions">
                  <div className="privacy-note">服务端仅在本次请求中使用凭据，不内置数据库，也不会保存 token。</div>
                  <button className="btn btn-primary" type="button" onClick={submit} disabled={isLoading}>
                    {isLoading ? <span className="spinner" aria-hidden="true" /> : null}
                    {isLoading ? "正在提取..." : "开始提取 UPI 二维码"}
                  </button>
                </div>
              </div>
            </>
          )}
        </section>

        <p className="footer-note">
          代理由服务端环境变量配置，源码不内置任何代理地址；购买者可在自己的部署环境中填写 HTTP / HTTPS / SOCKS5 代理。
        </p>
      </div>
    </main>
  );
}
