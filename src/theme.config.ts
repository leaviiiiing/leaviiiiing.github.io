// cannot use path alias here because unocss can not resolve it
import { defineConfig } from "./toolkit/themeConfig";

export default defineConfig({
  siteName: "Leaving's Blog",
  brand: {
    title: "Leaving's Blog",
    subtitle: "记录技术、生活与思考",
    logo: "✨",
  },
  nav: [
    { href: "/", text: "首页", icon: "i-ri-home-line" },
    {
      text: "文章",
      href: "/archives/",
      icon: "i-ri-quill-pen-fill",
      dropbox: {
        enable: true,
        items: [
          { href: "/categories/", text: "分类", icon: "i-ri-book-shelf-fill" },
          { href: "/tags/", text: "标签", icon: "i-ri-price-tag-3-fill" },
          { href: "/archives/", text: "归档", icon: "i-ri-archive-line" },
        ],
      },
    },
    { text: "友链", href: "/friends/", icon: "i-ri-link" },
    { text: "统计", href: "/statistics/", icon: "i-ri-bar-chart-box-line" },
  ],
  sidebar: {
    author: "Leaving",
    description: "一个热爱技术与写作的开发者",
  },
  footer: {
    since: 2026,
    powered: false,
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
