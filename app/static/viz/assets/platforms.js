export const platforms = {
  wechat: '微信',
  feishu: '飞书',
  dingtalk: '钉钉',
  wecom: '企业微信',
};

export const platformName = (value) => platforms[value || 'wechat'] || value;

export const platformOptions = () => Object.entries(platforms)
  .map(([value, label]) => `<option value="${value}">${label}</option>`).join('');
