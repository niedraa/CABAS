/**
 * Configuration dynamique : reprend app.json tel quel, et ajoute un chemin de
 * base quand `EXPO_BASE_URL` est défini (version web hébergée sous un
 * sous-chemin, ex. GitHub Pages : `/CABAS`). Sans variable, rien ne change.
 */
module.exports = ({ config }) => {
  const baseUrl = process.env.EXPO_BASE_URL;
  if (!baseUrl) return config;
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
