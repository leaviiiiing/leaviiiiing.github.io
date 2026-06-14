import { visit } from "unist-util-visit";

/**
 * remark-directive 处理器
 * 将 :::info, :::warning 等容器指令转换为 Note MDX 组件
 *
 * 支持的语法：
 * :::info
 * 内容
 * :::
 *
 * :::warning title="注意事项"
 * 内容
 * :::
 *
 * :::success
 * **支持 Markdown 格式**
 * :::
 */
export default function noteDirective() {
  return (tree) => {
    visit(tree, (node) => {
      if (node.type === "containerDirective" || node.type === "leafDirective") {
        const type = node.name;
        const validTypes = ["info", "warning", "success", "danger", "primary", "default"];

        if (!validTypes.includes(type)) return;

        // 获取属性
        const attributes = node.attributes || {};
        const data = node.data || (node.data = {});

        // 构建 MDX JSX 属性
        const jsxAttributes = [
          {
            type: "mdxJsxAttribute",
            name: "type",
            value: type,
          },
        ];

        // 可选的 title 属性
        if (attributes.title) {
          jsxAttributes.push({
            type: "mdxJsxAttribute",
            name: "title",
            value: attributes.title,
          });
        }

        // 可选的 icon 属性
        if (attributes.icon) {
          jsxAttributes.push({
            type: "mdxJsxAttribute",
            name: "icon",
            value: attributes.icon,
          });
        }

        // 转换为 MDX JSX 元素
        data.hName = "Note";
        data.hProperties = {};

        // 直接修改节点为 MDX JSX 元素
        node.type = "mdxJsxFlowElement";
        node.name = "Note";
        node.attributes = jsxAttributes;

        // 清理 data 属性
        delete node.data;
      }
    });
  };
}
