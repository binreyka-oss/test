import React from 'https://esm.sh/react?dev';
import ReactDOM from 'https://esm.sh/react-dom/client?dev';
import App from './App';
// Mount the root React component to the DOM
const rootElement = document.getElementById('root');
if (!rootElement) {
    throw new Error('Root element not found');
}
const root = ReactDOM.createRoot(rootElement);
root.render(React.createElement(App, null));
