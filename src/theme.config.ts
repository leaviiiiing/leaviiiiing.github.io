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
        title: "io-wy Blog",
        desc: "",
        author: "io-wy",
        avatar: "https://io-wy.github.io/blog/favicon.jpg",
      },
      {
        url: "https://soapsama.cn/",
        title: "Yume konseKi",
        desc: "",
        author: "SoapSama",
        avatar: "https://soapsama.cn/favicon/favicon.ico",
      },
      {
        url: "https://blog.s3loy.tech/",
        title: "s3loy's blog",
        desc: "",
        author: "s3loy",
        avatar: "https://blog.s3loy.tech/_astro/avatar.9KccEqOk_Z1LsABb.webp",
      },
      {
        url: "https://cube1345.github.io/",
        title: "Cube Diary",
        desc: "",
        author: "Cube1345",
        avatar: "https://cube1345.github.io/favicon.ico",
      },
      {
        url: "https://blog0x76.vercel.app/",
        title: "0x76's Blog",
        desc: "",
        author: "0x76",
        avatar: "https://blog0x76.vercel.app/favicon.ico",
      },
      {
        url: "https://blog.ptilopsis.cv/",
        title: "Pt's Blog",
        desc: "",
        author: "Ptilopsis",
        avatar: "https://blog.ptilopsis.cv/favicon.ico",
      },
      {
        url: "https://seandictionary.top/",
        title: "SeanDictionary",
        desc: "",
        author: "Sean",
        avatar: "https://seandictionary.top/wp-content/uploads/2024/09/cropped-哭哭_透明-192x192.png",
      },
    ],
  },
});
