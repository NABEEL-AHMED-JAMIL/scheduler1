import { Component, OnInit } from '@angular/core';

@Component({

    selector: 'spinner',
    template: `
        <div class="loader-overlay">
            <div class="loader-card">
                <div class="loader-ring">
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
                <span class="loader-text">Loading…</span>
            </div>
        </div>
    `,
    styles: [
      `
        :host {
          display: block;
          pointer-events: none;
        }
        :host .loader-overlay {
          position: fixed;
          width: 100%;
          height: 100%;
          top: 0;
          left: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(15, 20, 30, 0.32);
          backdrop-filter: blur(2px);
          -webkit-backdrop-filter: blur(2px);
          z-index: 1040;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.18s ease, visibility 0.18s ease;
        }
        :host(.is-visible) .loader-overlay {
          opacity: 1;
          visibility: visible;
          pointer-events: auto;
        }
        :host .loader-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
          padding: 26px 34px;
          background: #ffffff;
          border-radius: 14px;
          box-shadow: 0 12px 32px rgba(15, 20, 30, 0.22);
          transform: translateY(4px) scale(0.97);
          transition: transform 0.18s ease;
        }
        :host(.is-visible) .loader-card {
          transform: translateY(0) scale(1);
        }
        :host .loader-ring {
          position: relative;
          width: 44px;
          height: 44px;
        }
        :host .loader-ring div {
          position: absolute;
          box-sizing: border-box;
          width: 44px;
          height: 44px;
          border-radius: 50%;
          border: 3.5px solid transparent;
          animation: loader-ring-spin 1.15s cubic-bezier(0.5, 0, 0.5, 1) infinite;
        }
        :host .loader-ring div:nth-child(1) {
          border-top-color: #726006;
          animation-delay: 0s;
        }
        :host .loader-ring div:nth-child(2) {
          border-top-color: #7c3aed;
          opacity: 0.7;
          animation-delay: -0.15s;
        }
        :host .loader-ring div:nth-child(3) {
          border-top-color: #4e4104;
          opacity: 0.45;
          animation-delay: -0.3s;
        }
        :host .loader-text {
          font-size: 13px;
          font-weight: 600;
          letter-spacing: 0.02em;
          color: #2f3a45;
        }
        @keyframes loader-ring-spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }
      `
    ]
})
export class SpinnerComponent implements OnInit {
  constructor() {}

  ngOnInit() {}
}
