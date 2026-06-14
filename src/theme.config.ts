// cannot use path alias here because unocss can not resolve it
import { defineConfig } from "./toolkit/themeConfig";

export default defineConfig({
  siteName: "Leaving's Blog",
  brand: {
    title: "Leaving's Blog",
    subtitle: "记录技术、生活与思考",
    logo: "✨",
  },
  sidebar: {
    author: "Leaving",
    description: "一个热爱技术与写作的开发者",
  },
  footer: {
    since: 2026,
    icp: {
      enable: false,
    },
  },
  comments: {
    enable: false,
  },
  hyc: {
    enable: false,
  },
  friends: {
    title: "友链",
    description: "一些有趣的地方",
    links: [],
  },
});
