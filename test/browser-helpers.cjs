/* 浏览器测试公共工具：阻断外部字体请求
 *
 * index.html 的可选在线字体（fonts.googleapis.com 的 CSS + fonts.gstatic.com 的 woff2）
 * 在网络受限时会挂起，令 page.goto({ waitUntil: 'load' }) / page.reload() 一直等到超时。
 * 实测：不拦截时 load 超过 12s 仍不触发（pending 全是 woff2），拦截后 39ms 完成。
 * 字体本身有离线降级，阻断不影响游戏的渲染与断言，且让本地与 CI 的浏览器测试
 * 不再依赖外网可达性。
 */
'use strict'
const FONT_HOSTS = /fonts\.(googleapis|gstatic)\.com/

async function blockExternalFonts(target) {
  // 用空 CSS  fulfil 而非 abort：abort 会产生 net::ERR_FAILED 控制台错误，
  // 被各测试的「控制台零错误」断言抓到；空 CSS 不报错，且不会触发后续 woff2 请求。
  await target.route(FONT_HOSTS, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '' }))
}

/* 包装 browser，使之后创建的所有 context / page 自动生效（包括 browser.newPage 的隐式 context） */
function hardenBrowser(browser) {
  const rawNewContext = browser.newContext.bind(browser)
  browser.newContext = async (...args) => {
    const ctx = await rawNewContext(...args)
    await blockExternalFonts(ctx)
    return ctx
  }
  const rawNewPage = browser.newPage.bind(browser)
  browser.newPage = async (...args) => {
    const page = await rawNewPage(...args)
    await blockExternalFonts(page)
    return page
  }
  return browser
}

module.exports = { hardenBrowser, blockExternalFonts, FONT_HOSTS }
