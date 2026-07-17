import { useEffect, useState } from 'react';
import {
  fetchBillingConfig,
  createCheckout,
  confirmMockPayment,
  formatPrice,
  ApiError,
  type BillingConfig,
} from '../api.js';

interface Props {
  onClose: () => void;
  /** Called after credits are added (mock flow) so the parent can refresh balance. */
  onCredited: () => void;
}

export function BuyCredits({ onClose, onCredited }: Props) {
  const [config, setConfig] = useState<BillingConfig | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState<number | null>(null);

  useEffect(() => {
    fetchBillingConfig()
      .then(setConfig)
      .catch(() => setError('无法加载套餐信息'));
  }, []);

  const buy = async (packageId: string) => {
    if (busy) return;
    setError('');
    setBusy(packageId);
    try {
      const res = await createCheckout(packageId);
      if (res.checkoutUrl) {
        // Real provider (Stripe/Alipay): hand off to the hosted checkout page.
        window.location.href = res.checkoutUrl;
        return;
      }
      // Mock: confirm immediately to exercise the full grant path.
      const r = await confirmMockPayment(res.ref);
      setDone(r.credited);
      onCredited();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : '支付失败，请稍后再试');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2>充值积分</h2>
          <button className="link-btn" onClick={onClose}>
            关闭
          </button>
        </div>

        {done !== null ? (
          <>
            <p className="modal-sub">已到账 {done} 积分，可以继续研究了。</p>
            <button className="auth-submit" onClick={onClose}>
              完成
            </button>
          </>
        ) : (
          <>
            <p className="modal-sub">
              积分用于每次研究运行（每次消耗固定积分）。选择套餐完成支付即可到账。
            </p>

            {error && <div className="auth-error">{error}</div>}

            {!config ? (
              <div className="empty">加载中…</div>
            ) : (
              <div className="pkg-list">
                {config.packages.map((p) => (
                  <button
                    key={p.id}
                    className="pkg"
                    disabled={!!busy}
                    onClick={() => buy(p.id)}
                  >
                    <span>
                      <span className="pkg-credits">{p.credits} 积分</span>
                      <br />
                      <span className="pkg-sub">{p.label}</span>
                    </span>
                    <span className="pkg-price">
                      {busy === p.id ? '处理中…' : formatPrice(p.amount, p.currency)}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {config && (
              <p className="modal-note">
                {config.provider === 'mock'
                  ? '当前为演示支付（Mock）：点击套餐即时到账，用于本地验证。'
                  : `支付渠道：${config.provider}`}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
