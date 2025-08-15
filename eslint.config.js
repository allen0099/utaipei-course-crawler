import globals from "globals";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";

export default [
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      // Add any specific ESLint rules here if needed
    },
  },
  eslintPluginPrettierRecommended,
  {
    ignores: [".origin/**"],
  },
];
