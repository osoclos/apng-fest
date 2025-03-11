# APNG Fest - An Image Manipulation Library

A simple yet powerful encoder and decoder for animated .PNGs

## Introduction

`apng-fest` is a client-side JavaScript library that aims to simplify the process of creating and manipulating animated .PNG images.

## Getting Started

### Installation

There are a number of ways to install the `apng-fest` library, the most common being to use a package manager and import in your code.

#### Using npm/yarn/pnpm/bun

``` sh
$ npm install apng-fest
```

``` sh
$ yarn add apng-fest
```

``` sh
$ pnpm install apng-fest
```

``` sh
$ bun add apng-fest
```

#### Importing

``` js
// import apng-fest into your code...
import APNG from "apng-fest";

// use apng-fest here...
const apng = await APNG.create(100, 100);
```

Another way of installing `apng-fest` would be through a CDN via a `<script>` tag in your .HTML file.

#### Using a CDN

``` html
<script src="https://cdn.jsdelivr.net/npm/apng-fest/dist/index.min.js"></script>

<script>
    // import apng-fest into your code...
    const { APNG } = AF;

    // use apng-fest here...
    const apng = await APNG.create(100, 100);
</script>
```

You can also instead include the ES module file as well.

``` html
<script type="module">
    // import apng-fest into your code...
    import APNG from "https://cdn.jsdelivr.net/npm/apng-fest/dist/index.es.min.js";

    // use apng-fest here...
    const apng = await APNG.create(100, 100);
</script>

<!-- better yet: use an importmap instead -->
<script type="importmap">
    {
        "imports": {
            "apng-fest": "https://cdn.jsdelivr.net/npm/apng-fest/dist/index.es.min.js"
        }
    }
</script>

<script type="module">
    // import apng-fest into your code...
    import APNG from "apng-fest";

    // use apng-fest here...
    const apng = await APNG.create(100, 100);
</script>
```

### Usage

Here is a simple HTML + JavaScript example using the `apng-fest` library:

``` html
<canvas id="example" width="100" height="100"></canvas>
<script>
    // create constant variables
    const WIDTH = 100;
    const HEIGHT = 100;

    const FPS = 60;

    const RECT_WIDTH = 60;
    const RECT_HEIGHT = 60;

    // create canvas context
    const canvas = document.getElementById("example");
    const ctx = canvas.getContext("2d", { willReadFrequently: true });

    // create our animated .PNG here
    const apng = await APNG.create(WIDTH, HEIGHT);
    
    // variables for graphics
    let hue = 0;
    let angle = 0;

    // start a loop to draw our canvas
    const intervalId = setInterval(async () => {
        // clears our canvas before drawing
        ctx.clearRect(0, 0, WIDTH, HEIGHT);

        // manipulate our context for our rectangle
        ctx.translate(WIDTH / 2, HEIGHT / 2);
        ctx.rotate(angle);

        // sets our rectangle color and draws it onto our canvas
        ctx.fillStyle = `hsl(${hue} 100% 50%)`;
        ctx.fillRect(-RECT_WIDTH / 2, -RECT_HEIGHT / 2, RECT_WIDTH, RECT_HEIGHT);
        
        // reset our context to the original manipulation matrix
        ctx.resetTransform();

        // adds a frame to our animated .PNG image
        const frame = Frame.fromCtx(ctx, { delay: 1 / FPS });
        apng.frames.push(frame);

        // changes hue and angle for the next drawing tick
        hue++;
        angle += Math.PI / 180;

        // loops again if the hue has not exceeded 360 degrees
        if (hue < 360) return;

        // stops our loop
        clearInterval(intervalId);

        // create our animated .PNG image and adds it to the DOM
        const image = await apng.toImg();
        document.body.appendChild(image);
    }, 1000 / FPS);
</script>
```

Preview of this example is linked [here](https://osoclos.github.io/apng-demo).
