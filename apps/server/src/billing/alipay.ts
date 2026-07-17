import type { PaymentProvider, CheckoutArgs, CheckoutResult } from './provider.js';

// 支付宝（电脑网站支付 alipay.trade.page.pay）预留框架。
//
// 现状：缺少商户密钥时禁用，checkout 给出清晰提示。商户资质齐备后按下方 TODO
// 接入 `alipay-sdk` 即可，无需改动路由 / 积分 / 履约逻辑（webhook → fulfillPayment
// 已与其它渠道统一）。
//
// 接入步骤（拿到 appId / 应用私钥 / 支付宝公钥后）：
//   1. npm i alipay-sdk --workspace @ars/server
//   2. createCheckout：
//        const sdk = new AlipaySdk({ appId, privateKey, alipayPublicKey, gateway });
//        const url = sdk.pageExecute('alipay.trade.page.pay', 'GET', {
//          bizContent: {
//            out_trade_no: args.ref,          // 用我们的 ref 作为商户订单号
//            total_amount: (args.pkg.amount / 100).toFixed(2), // 元
//            subject: args.pkg.label,
//            product_code: 'FAST_INSTANT_TRADE_PAY',
//          },
//          returnUrl: args.returnUrl,
//          notifyUrl: `${PUBLIC_BASE_URL}/api/billing/webhook/alipay`,
//        });
//        return { checkoutUrl: url };
//   3. handleWebhook（异步通知 notify，表单编码）：
//        const params = Object.fromEntries(new URLSearchParams(raw));
//        if (!sdk.checkNotifySign(params)) throw new Error('sign mismatch');
//        if (params.trade_status === 'TRADE_SUCCESS' || params.trade_status === 'TRADE_FINISHED')
//          return { ref: params.out_trade_no };
//        return null;
//      注意：notify 需返回纯文本 "success"（当前路由返回 JSON，接入时按支付宝要求调整）。
//
// 微信支付（Native 扫码）后续同理：另建 WechatProvider，handleWebhook 验签后
// 返回 { ref }，复用同一 fulfillPayment。
export class AlipayProvider implements PaymentProvider {
  readonly id = 'alipay' as const;
  readonly enabled = !!(
    process.env.ALIPAY_APP_ID &&
    process.env.ALIPAY_PRIVATE_KEY &&
    process.env.ALIPAY_PUBLIC_KEY
  );

  async createCheckout(_args: CheckoutArgs): Promise<CheckoutResult> {
    if (!this.enabled) throw new Error('支付宝未配置（缺少 ALIPAY_APP_ID / 私钥 / 公钥）');
    // TODO(M5+): 接入 alipay-sdk，见文件顶部步骤 2。
    throw new Error('支付宝支付尚未接入，请先配置商户密钥并完成 alipay-sdk 对接');
  }

  async handleWebhook(): Promise<{ ref: string } | null> {
    // TODO(M5+): 校验 notify 签名并返回 { ref: out_trade_no }，见文件顶部步骤 3。
    return null;
  }
}
