// cannot use path alias here because unocss can not resolve it
import { defineConfig } from "./toolkit/themeConfig";

export default defineConfig({
  siteName: "Leaving's Blog",
  brand: {
    title: "Leaving's Blog",
    subtitle: "记录技术、生活与思考",
    logo: "",
  },
  nav: [
    { href: "/", text: "首页", icon: "i-ri-home-line" },
    {
      text: "文章",
      href: "/tags/",
      icon: "i-ri-quill-pen-fill",
      dropbox: {
        enable: true,
        items: [
          { href: "/tags/", text: "标签", icon: "i-ri-price-tag-3-fill" },
        ],
      },
    },
    { text: "友链", href: "/friends/", icon: "i-ri-link" },
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
  widgets: {
    randomPosts: false,
  },
  layout: {
    rightSidebar: {
      announcement: false,
      search: false,
      calendar: true,
      recentMoments: true,
      randomPosts: false,
      tagCloud: true,
    },
  },
  copyright: {
    show: false,
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
    links: [
      {
        url: "https://io-wy.github.io/blog/",
        title: "io-wy's Blog",
        desc: "",
        author: "io-wy",
        avatar: "",
      },
      {
        url: "https://soapsama.cn/",
        title: "SoapSama",
        desc: "",
        author: "SoapSama",
        avatar: "",
      },
      {
        url: "https://blog.s3loy.tech/",
        title: "S3loy's Blog",
        desc: "",
        author: "S3loy",
        avatar: "",
      },
      {
        url: "https://cube1345.github.io/",
        title: "Cube1345",
        desc: "",
        author: "Cube1345",
        avatar: "",
      },
      {
        url: "https://blog0x76.vercel.app/",
        title: "0x76's Blog",
        desc: "",
        author: "0x76",
        avatar: "",
      },
      {
        url: "https://blog.ptilopsis.cv/",
        title: "Ptilopsis",
        desc: "",
        author: "Ptilopsis",
        avatar: "",
      },
      {
        url: "https://seandictionary.top/",
        title: "Sean's Dictionary",
        desc: "",
        author: "Sean",
        avatar: "",
      },
    ],
  },
});
