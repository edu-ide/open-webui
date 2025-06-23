import OpenWebUIChatElement from './OpenWebUIChatElement';

// Web Component 등록
if (!customElements.get('open-webui-chat')) {
  customElements.define('open-webui-chat', OpenWebUIChatElement);
}

// 전역 타입 선언
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'open-webui-chat': React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          theme?: 'light' | 'dark';
          'user-id'?: string;
          'session-token'?: string;
          'chat-id'?: string;
        },
        HTMLElement
      >;
    }
  }
}

export { OpenWebUIChatElement };
export default OpenWebUIChatElement;