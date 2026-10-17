/**
 * 群机器人 webhook
 *
 * 打卡提醒不接邮件 / 推送服务，直接打到用户自己的群机器人：
 * 企业微信、钉钉、飞书都只要一个 URL，零配置、零费用。
 *
 * 三家域名做白名单，避免服务端被当成任意 URL 的代理（SSRF）。
 */

const ALLOWED_HOSTS = [
  'qyapi.weixin.qq.com', // 企业微信群机器人
  'oapi.dingtalk.com', // 钉钉群机器人
  'open.feishu.cn', // 飞书自定义机器人
  'open.larksuite.com', // 飞书国际版
];

export type WebhookKind = 'wecom' | 'dingtalk' | 'feishu';

export function isAllowedWebhook(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return false;
    return ALLOWED_HOSTS.includes(url.hostname);
  } catch {
    return false;
  }
}

export function webhookKind(raw: string): WebhookKind | null {
  try {
    const host = new URL(raw).hostname;
    if (host === 'qyapi.weixin.qq.com') return 'wecom';
    if (host === 'oapi.dingtalk.com') return 'dingtalk';
    if (host === 'open.feishu.cn' || host === 'open.larksuite.com') return 'feishu';
    return null;
  } catch {
    return null;
  }
}

/** 三家只有飞书的字段名不一样（msg_type / content.text） */
export function buildWebhookPayload(kind: WebhookKind, text: string): unknown {
  if (kind === 'feishu') {
    return { msg_type: 'text', content: { text } };
  }
  return { msgtype: 'text', text: { content: text } };
}

/** 站点地址：换域名时改这里（或配 SITE_URL 环境变量） */
export const DEFAULT_SITE_URL = 'https://eyu.letsgo.cc.cd';

/** 提醒文案：带上到期数量和今日进度，让人有点击的欲望 */
export function buildReminderText(input: {
  name: string | null;
  due: number;
  done: number;
  streak: number;
  siteUrl?: string;
}): string {
  const who = input.name?.trim() || '同学';
  const lines = [`${who}，今天的英语还差一点 📚`];

  if (input.due > 0) {
    lines.push(`有 ${input.due} 张卡片到复习时间了，过一遍大约 5 分钟。`);
  } else {
    lines.push('今天还没打卡，学几张新词也算数。');
  }

  if (input.done > 0) lines.push(`今天已经复习 ${input.done} 张，别断在最后一步。`);
  if (input.streak > 0) lines.push(`连续打卡 ${input.streak} 天，继续保持。`);
  lines.push(input.siteUrl?.trim() || DEFAULT_SITE_URL);

  return lines.join('\n');
}
