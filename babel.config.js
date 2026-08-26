module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 runs its animation callbacks on the UI thread, and the
    // worklets plugin is what compiles them for it. It has to be last.
    // BUILD-SPEC 2.1 admits Reanimated for the court board and nothing else.
    plugins: ['react-native-worklets/plugin'],
  };
};
