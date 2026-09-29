import {themes as prismThemes} from 'prism-react-renderer';

export default {
  title: 'new-comms user guide',
  tagline: 'Set up, understand and run your comms.',
  url: process.env.DOCS_URL || 'http://localhost:3000',
  baseUrl: process.env.DOCS_BASE_URL || '/',
  favicon: 'img/mark.svg',
  onBrokenLinks: 'throw',
  markdown: {hooks: {onBrokenMarkdownLinks: 'throw'}},
  trailingSlash: false,
  presets: [['classic', {
    docs: {routeBasePath: '/', sidebarPath: './sidebars.js'},
    blog: false,
    theme: {customCss: './src/css/custom.css'},
  }]],
  themes: [['@easyops-cn/docusaurus-search-local', {
    hashed: true, language: ['en'], indexDocs: true, indexBlog: false,
    docsRouteBasePath: '/', highlightSearchTermsOnTargetPage: true,
  }]],
  themeConfig: {
    colorMode: {defaultMode: 'dark', disableSwitch: false, respectPrefersColorScheme: false},
    navbar: {title: 'new-comms', logo: {alt: '', src: 'img/mark.svg'}, items: [
      {to: '/setup/start-a-show', label: 'Start a show', position: 'left'},
      {to: '/use/join-a-show', label: 'Join a show', position: 'left'},
      {to: '/operate/troubleshooting', label: 'Get help', position: 'right'},
    ]},
    footer: {style: 'dark', copyright: 'new-comms · User guide · For the ports, triggers and functions model'},
    docs: {sidebar: {hideable: true}},
    prism: {theme: prismThemes.github, darkTheme: prismThemes.dracula, additionalLanguages: ['bash']},
  },
};
