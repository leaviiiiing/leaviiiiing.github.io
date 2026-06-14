import { visit } from "unist-util-visit";

/**
 * remark-directive 处理器
 * 将 :span[xxx] 行内指令转换为 <span>xxx</span>
 *
 * 支持的语法：
 * :span[文本内容]
 * :span[红色文字]{.text-red}
 * :span[带属性]{data-value="test"}
 *
 * 注意：这是推荐方案，避免与 Markdown 链接语法冲突
 */
export default function spanDirective() {
  return (tree) => {
    visit(tree, "textDirective", (node) => {
      if (node.name !== "span") return;

      // 构建 MDX JSX 属性
      const jsxAttributes = [];

      // 处理 class 属性（来自 {.class} 语法）
      if (node.attributes?.class) {
        jsxAttributes.push({
          type: "mdxJsxAttribute",
          name: "class",
          value: node.attributes.class,
        });
      }

      // 处理其他属性
      for (const [key, value] of Object.entries(node.attributes || {})) {
        if (key === "class") continue;
        jsxAttributes.push({
          type: "mdxJsxAttribute",
          name: key,
          value: value,
        });
      }

      // 转换为 MDX JSX 元素
      node.type = "mdxJsxTextElement";
      node.name = "span";
      node.attributes = jsxAttributes;

      // 清理 data 属性
      delete node.data;
    });
  };
}
