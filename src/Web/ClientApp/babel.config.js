module.exports = function(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      ['module-resolver', {
        alias: {
          '@': './src',
          'react-native-vector-icons': 'react-native-vector-icons',
        },
      }],
    ],
    env: {
      production: {
        plugins: []
      }
    }
  };
};