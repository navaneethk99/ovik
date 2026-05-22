const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Ensure Metro watches the entire monorepo, including the shared .pnpm store
config.watchFolders = [workspaceRoot];

// 2. Pin React, React-DOM, and React Native to the mobile project's local versions (React 18)
const singletons = ['react', 'react-dom', 'react-native'];
config.resolver.extraNodeModules = singletons.reduce((acc, name) => {
  acc[name] = path.resolve(projectRoot, 'node_modules', name);
  return acc;
}, {});

// 3. Intercept all resolution requests for singletons and force them to resolve from the mobile project context
config.resolver.resolveRequest = (context, moduleName, platform) => {
  const isSingleton = singletons.some(
    name => moduleName === name || moduleName.startsWith(name + '/')
  );
  if (isSingleton) {
    return context.resolveRequest(
      {
        ...context,
        originModulePath: path.resolve(projectRoot, 'index.js'),
      },
      moduleName,
      platform
    );
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
