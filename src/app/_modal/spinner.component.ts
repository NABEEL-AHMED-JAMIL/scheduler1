import { Component, OnInit } from '@angular/core';


@Component({
  // tslint:disable-next-line: component-selector
  selector: 'spinner',
  template: `
    <div class="dark-overlay">
      <div class="loader">Loading...</div>
    </div>
  `,
  styles: [
    `
      :host {
        display: none;
      }
      :host .dark-overlay {
        position: fixed;
        width: 100%;
        height: 100%;
        top: 0;
        background: rgba(0, 0, 0, 0.48);
        z-index: 1040;
      }
      :host .loader {
        color: #ffffff;
        font-size: 12px;
        width: 0.7em;
        height: 0.7em;
        border-radius: 50%;
        position: relative;
        top: 50%;
        left: 50%;
        text-indent: -9999em;
        animation: load4 1.3s infinite linear;
        transform: translateX(-50%) translateY(-50%);
      }
      @-webkit-keyframes load4 {
        0%,
        100% {
          box-shadow: 0 -3em 0 0.2em, 2em -2em 0 0em, 3em 0 0 -1em,
            2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em,
            -2em -2em 0 0;
        }
        12.5% {
          box-shadow: 0 -3em 0 0, 2em -2em 0 0.2em, 3em 0 0 0, 2em 2em 0 -1em,
            0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
        }
        25% {
          box-shadow: 0 -3em 0 -0.5em, 2em -2em 0 0, 3em 0 0 0.2em, 2em 2em 0 0,
            0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
        }
        37.5% {
          box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 0,
            2em 2em 0 0.2em, 0 3em 0 0em, -2em 2em 0 -1em, -3em 0em 0 -1em,
            -2em -2em 0 -1em;
        }
        50% {
          box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em,
            2em 2em 0 0em, 0 3em 0 0.2em, -2em 2em 0 0, -3em 0em 0 -1em,
            -2em -2em 0 -1em;
        }
        62.5% {
          box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em,
            2em 2em 0 -1em, 0 3em 0 0, -2em 2em 0 0.2em, -3em 0 0 0,
            -2em -2em 0 -1em;
        }
        75% {
          box-shadow: 0em -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 -1em,
            2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0.2em,
            -2em -2em 0 0;
        }
        87.5% {
          box-shadow: 0em -3em 0 0, 2em -2em 0 -1em, 3em 0 0 -1em,
            2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0,
            -2em -2em 0 0.2em;
        }
      }
      @keyframes load4 {
        0%,
        100% {
          box-shadow: 0 -3em 0 0.2em, 2em -2em 0 0em, 3em 0 0 -1em,
            2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em,
            -2em -2em 0 0;
        }
        12.5% {
          box-shadow: 0 -3em 0 0, 2em -2em 0 0.2em, 3em 0 0 0, 2em 2em 0 -1em,
            0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
        }
        25% {
          box-shadow: 0 -3em 0 -0.5em, 2em -2em 0 0, 3em 0 0 0.2em, 2em 2em 0 0,
            0 3em 0 -1em, -2em 2em 0 -1em, -3em 0 0 -1em, -2em -2em 0 -1em;
        }
        37.5% {
          box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 0,
            2em 2em 0 0.2em, 0 3em 0 0em, -2em 2em 0 -1em, -3em 0em 0 -1em,
            -2em -2em 0 -1em;
        }
        50% {
          box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em,
            2em 2em 0 0em, 0 3em 0 0.2em, -2em 2em 0 0, -3em 0em 0 -1em,
            -2em -2em 0 -1em;
        }
        62.5% {
          box-shadow: 0 -3em 0 -1em, 2em -2em 0 -1em, 3em 0 0 -1em,
            2em 2em 0 -1em, 0 3em 0 0, -2em 2em 0 0.2em, -3em 0 0 0,
            -2em -2em 0 -1em;
        }
        75% {
          box-shadow: 0em -3em 0 -1em, 2em -2em 0 -1em, 3em 0em 0 -1em,
            2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0.2em,
            -2em -2em 0 0;
        }
        87.5% {
          box-shadow: 0em -3em 0 0, 2em -2em 0 -1em, 3em 0 0 -1em,
            2em 2em 0 -1em, 0 3em 0 -1em, -2em 2em 0 0, -3em 0em 0 0,
            -2em -2em 0 0.2em;
        }
      }
    `
  ]
})
export class SpinnerComponent implements OnInit {
  constructor() { }

  ngOnInit() { }
}
