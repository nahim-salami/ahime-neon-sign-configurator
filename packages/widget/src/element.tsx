/**
 * Web component <ahns-config> — Shadow DOM (isolation du thème hôte) + montage
 * React. Les @font-face sont injectées dans le DOCUMENT (elles ne chargent pas
 * depuis un shadow root — voir fonts.ts).
 */

import { createRoot, type Root } from 'react-dom/client';
import { createElement } from 'react';
import NeonConfigurator from './NeonConfigurator';
import { WIDGET_CSS } from './styles';
import { ensureFontsInjected } from './fonts';

export class NeonConfigElement extends HTMLElement {
  private reactRoot: Root | null = null;

  connectedCallback(): void {
    if (this.shadowRoot) return;
    ensureFontsInjected();
    const shadow = this.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = WIDGET_CSS;
    shadow.appendChild(style);
    const mount = document.createElement('div');
    /*
     * DEUX FAÇONS D'OCCUPER LA PAGE.
     *
     * Par défaut, le configurateur remplit une hauteur donnée par l'hôte et
     * fait défiler SES colonnes : c'est la page dédiée, où il est seul.
     *
     * Sur une FICHE PRODUIT, il n'est pas seul — il y a un titre, une
     * description, des onglets, des produits liés. Enfermer les réglages dans
     * une boîte de 78 % de l'écran y ajoute un deuxième ascenseur à l'intérieur
     * du premier, et le client ne sait plus lequel il fait tourner. En mode
     * « fiche », la colonne de droite se déroule et c'est la PAGE qui défile.
     */
    const vue = 'fiche' === this.getAttribute('data-vue') ? 'fiche' : 'pleine';
    mount.style.height = 'fiche' === vue ? 'auto' : '100%';
    shadow.appendChild(mount);
    this.reactRoot = createRoot(mount);
    this.reactRoot.render(createElement(NeonConfigurator, { vue }));
  }

  disconnectedCallback(): void {
    this.reactRoot?.unmount();
    this.reactRoot = null;
  }
}

if (!customElements.get('ahns-config')) {
  customElements.define('ahns-config', NeonConfigElement);
}
