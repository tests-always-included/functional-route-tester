Functional Route Tester
=======================

Test middleware functionally by simulating requests through the framework of your choice. Works with [Restiq], [Restify], [Express] and can be extended for others. Helper functions available for [Jasmine].

[![npm version][npm-badge]][npm-link]
[![Build Status][travis-badge]][travis-link]
[![Dependencies][dependencies-badge]][dependencies-link]
[![Dev Dependencies][devdependencies-badge]][devdependencies-link]
[![codecov.io][codecov-badge]][codecov-link]


Functional Testing is Better
----------------------------

Testing is hard, so it is best to make things as easy as possible. Also, functionally testing an API is better because it traces completely through your codebase, ensuring that each module is communicating effectively with every other part. Trying to simulate requests without opening a port on a machine would be best.

This module is designed to use mock request and response objects and pass them through the framework of your choice. When the request is completed, a `Promise` is resolved with a result object that has helper methods and properties that are designed to simplify testing.


Installation
------------

Use `npm` to install this package easily.

    $ npm install --save functional-route-tester

Alternately you may edit your `package.json` and add this to your `dependencies` object:

    {
        ...
        "dependencies": {
            ...
            "functional-route-tester": "*"
            ...
        }
        ...
    }


Getting Started
---------------

The `FunctionalTest` object is used to initiate requests through the framework and into the routes you have set up. First, you need to create a `FunctionalTest` object and it is strongly suggested that you use a helper function or include it into your testing framework.


### Jasmine 2.x

First, add this module to your `package.json` as described under Installation.

Inside your `spec/support/jasmine.json` file, modify the "helpers" key:

    {
        ...
        "helpers": [
            "../node_modules/functional-route-tester/helper/**/*.js"
        ]
        ...
    }

You should create your own helper function to assist you with your server framework. See the `helper/` folder for each supported framework and what one needs to do in order to start the application.

    var functionalTest;

    beforeEach((done) => {
        callYourHelperAsync().then((theNewFunctionalTest) => {
            functionalTest = theNewFunctionalTest;
        }).then(done, done);
    });


### Jasmine 1.x

Add the module to your `package.json` as shown under the Installation heading.

Next, when you run `jasmine-node`, add the helpers folder.

    # Before:
    jasmine-node lib/ spec/

    # After:
    jasmine-node node_modules/functional-route-tester/helper/ lib/ spec/

It is best to create your own helper function that assists with bootstrapping your server framework. See the `helper/` folder for each supported framework and decide what needs to be done in order to start your server.

When you create your helper, you would kick off functional tests with a `beforeEach()` as follows:

    var functionalTest;

    beforeEach((done) => {
        callYourHelperAsync().then((theNewFunctionalTest) => {
            functionalTest = theNewFunctionalTest;
        }).then(done, done);
    });


### Another Testing Framework

This is more difficult at the moment, but you would need to mimic the Jasmine helpers in how they work. The idea is that you provide a simple way for people inject the necessary bits into the server framework that meshes nicely with the testing framework. Most likely, this new code would be strikingly similar to the helpers for Jasmine.


`FunctionalTest` API
--------------------

A `FunctionalTest` object will route requests through the server framework and your routes. It also helps to convert a request into a more standard format for you, specifically taking away the need to make `Buffer` objects that contain the data you're sending.


### Properties

The following properties are assigned to each instance and are not on the prototype.

* `functionalTest.debug` (function) - How everything logs debug messages. Includes the ID number to keep debug messages straight.
* `functionalTest.id` (number) - Unique number generated for each instance. Useful for logging and corresponding parallel tests.
* `functionalTest.requestHandler` (function) - The request handler passed into the constructor.


### Debugging

Debugging messages are sent to the `debug` module using the key of `FunctionalTest`. Enable them by setting a `DEBUG` environment variable when running code or tests.

    DEBUG=FunctionalTest npm run start


### `functionalTest = new FunctionalTest(requestHandler)`

The `requestHandler` is the function passed to `http.createServer()`. It should route a request through the framework of choice. This is *not* middleware and should expect only a request and response object, though the functional route tester will log if a `done` callback is called.

    // Rudimentary Jasmine example. A more complete set of examples are
    // included as helpers in this project.
    var functionalTest;

    spyOn(http, "createServer").andCallFake((handler) => {
        requestHandler = handler;
    });

    // Do what you need to start the framework.
    ...

    // Now create the FunctionalTest instance.
    functionalTest = new FunctionalTest(requestHandler


### `buffer = functionalTest.coerseToBuffer(something)`

Creates a `Buffer` out of something if it isn't already a buffer. Simply calls `JSON.stringify()` on objects to convert to a string and then converts all strings to `Buffer` objects.


### `headerValue = functionalTest.getHeader(headerObject, headerName)`

HTTP headers are case-insensitive. To help out, this function will scan the header object's keys and return the value to the first key that matches the `headerName`, regardless of its case.

    // Outputs "www.example.com"
    console.log(functionalTest.getHeader({
        host: "www.example.com"
    }, "HOST");


### `functionalTest.reformatRequestOptions(options)`

This changes the request options that are passed to the mock request object. It is documented and exposed in case the need arises to monkey patch it for a specific framework. The function's goal is to alter the `options` object in a way to standardize it before being sent to the mock request (courtesy of `node-mocks-http`). This includes the following:

* Make `options.headers` an object if it wasn't already set.
* Assign a default `Host` header if one is not found. It's set to "localhost".
* Reformat the request URI using `this.reformatRequestUri()`.
* If there is a body, convert the body to a buffer using `this.coerseToBuffer()`.
* If there is a body, set the `Content-Type` header to "application-json" if one was not already set.
* Set a default `options.timeoutMs` timeout when one was not set.

Monkey patching is covered separately.


### `functionalTest.reformatRequuestUri(options)`

This changes `options.uri` in the following ways:

 * Replace `{key}` in templated URIs with values from an `options.parameters` object. Does not replace keys that are undefined in `options.parameters`.
 * Append query string parameters to `options.uri`. This is smart enough to compensate if there are query string parameters that are already included.

This is only exposed to support monkey patching, which is covered elsewhere.


### `resultPromise = functionalTest.requestAsync(method, uri, [options])`

Initiate a request using the given HTTP verb and a URI path. The optional `options` object controls the request and are detailed below. The returned promise is resolved if there is any response, regardless of the HTTP status code. The promise is rejected if the request times out or if there is any error thrown during request processing.

The `method` should be all uppercase, but it is conceivable that a request would come in with lowercase letters and you can test if a framework supports that scenario because this module does not alter the method.

The `uri` is not a full URI but just the path portion and query string. The protocol, username, password, host and port portions should be stripped off.

The optional `options` object can contain the following properties.

* `options.body` (mixed) - What to send as a body. Converted to a `Buffer` automatically.
* `options.headers["Content-Type"]` - Automatically defaults to "application/json" when sending a body.
* `options.headers.Host` - Automatically defaults to "localhost".
* `options.headers` (object) - Key/value hash of headers to send.
* `options.method` (string) - Overwritten by the `meethod` passed to `requestAsync()`.
* `options.parameters` (object) - Key/value hash of keys to replace in the URI.
* `options.timeoutMs` (number) - How long to wait for the request to finish before rejecting the promise.
* `options.url` (string) - Overwritten by the `uri` passed to `requestAsync()`.

Here is an example that relies on a helper, `callMyHelperAsync()` to generate the `FunctionalTest` instance. Then it shows off how `requestAsync()` can be called utilizing a callback. If your testing framework supports promises (and [jasmine-test-helpers] can add them to Jasmine 1.x and 2.x), then the alternate form of returning a `Promise` can be shown, and that's also in the example.

    var functionalTest;

    // Using a callback
    beforeEach((done) => {
        callMyHelperAsync().then((theNewFunctionalTest) => {
            functionalTest = theNewFunctionalTest;
        }).then(done, done);
    });

    // Using callback
    it("answers on a request to the root", (done) => {
        functionalTest.requestAsync("GET", "/").then((result) => {
            expect(result.statusCode).toBe(200);
        }).then(done, done);
    });

    // Using a promise, such as with jasmine-test-helpers module
    it("returns 404 on a missing file", () => {
        return functionalTest.requestAsync("GET", "/xyz").then((result) => {
            expect(result.statusCode).toBe(404);
        });
    });


`FunctionalTestResult` API
----------------------------

This contains the request, response, and helper functions.


### Debugging

Debugging messages are sent to the `debug` module using the key of `FunctionalTest`. Enable them by setting a `DEBUG` environment variable when running code or tests.

    DEBUG=FunctionalTestResult npm run start

For fuller logging that includes the `FunctionalTest` events, use a comma delimited list.

    DEBUG=FunctionalTest,FunctionalTestResult npm run start

This object can also be converted to a string, which can then be sent to the console. It's colorized by default.

    console.log(result.toString()); // Colorized
    console.log(result.toString(false)); // Boring, not colorful


### Properties

The following properties are assigned to each instance and are not on the prototype.

* `result.body` (mixed) - What was sent back to Node. This is the response and may have been converted to a `Buffer` by your framework of choice. It is not altered by the functional route tester.
* `result.debug` (function) - How everything logs debug messages. Includes the ID number to keep debug messages straight.
* `result.functionalTest` (`FunctionalTest`) - The associated test instance. Used for following links.
* `result.headers` (object) - Key/value hash of headers applied to the response. Use `getResponseHeader()` instead of searching this object.
* `result.id` (number) - Unique number generated for each instance. Useful for logging and corresponding parallel requests for a test.
* `result.links` (`HttpLinkHeader`) - Parsed link header object when a "Link" header is found, `null` otherwise. The `HttpLinkHeader` object has methods to help you query the links and the `FunctionalTestResult` instance has others.
* `result.req` (`MockHttpRequest`) - The mock request object.
* `result.requestOptions` (object) - Options used to create the `MockHttpRequest` instance.
* `result.res` (`MockHttpResponse`) - The mock response object.
* `result.responseOptions` (object) - Options used to create the `MockHttpResponse` instance.
* `result.statusCode` (number) - The status code from the response. Converted to consistently be a number.
* `result.toStringMethods` (array of strings) - Method names to call when `toString()` is called on the response instance.
* `result.uri` (string) - The URI requested.


### `result = new FunctionalTestResult(functionalTest, requestOptions, responseOptions)`

This is an internal function and is described only to support monkey patching. It sets many properties on the response object. A sample monkey patch is discussed elsewhere.


### `result.finalize()`

This sets the following properties after the response comes back. `finalize()` is only called when the request is successful and it is not called if the request times out.

* `result.body` is whatever was sent to the response.
* `result.statusCode` is the status code, converted to a number to be consistent.
* `result.headers` is an object with key/value headers.
* `result.links` is assigned an instance of `HttpLinkHeader` when the headers have a "Link" value.


### `linkDefinition = result.findLink(rel, [title])`

Locate a single link by searching for a matching link relation (`rel`). When specified, the `title` attribute must also match. Throws an `Error` for the following reasons:

* No links were returned in the headers.
* No links are found for a link relation.
* Multiple links were found for a link relation (and optionally title).
* No links were found for a link relation after filtering for a matching title.

The resulting link definition is an object that has a `url` property and additional properties for each attribute specified for the link.

    it("provides a link to a registration service", (done) => {
        functionalTest.requestAsync("GET", "/").then((result) => {
            var linkDefinition;

            linkDefinition = {
                url: "finding the link failed if you see this"
            };
            expect(() => {
                linkDefinition = result.findLink("service", "registration");
            }).not.toThrow();
            expect(linkDefinition.url).toEqual("/registration");
        }).then(done, done);
    });


### `linkDefinitionPromise = result.findLinkAsync(rel, [title])`

Identical to `findLink()` except that it provides the result through a `Promise`.

    it("provides a link to a registration service", (done) => {
        functionalTest.requestAsync("GET", "/").then((result) => {
            return response.findLinkAsync("service", "registration");
        }).then((linkDefinition) => {
            expect(linkDefinition.url).toEqual("/registration");
        }).then(done, done);
    });


### `secondResultPromise = result.followAsync(method, rel, [title,] options)`

This is a blend of `followLink()` and `FunctionalTest`'s `requestAsync()`. It looks for the given link relation. If exactly one link is found, it initiates a request to that URI.

If anything fails, the `Promise` is rejected.

Please see the other methods for a description of the parameters.

    it("lets the user go to the catalog's index", (done) => {
        functionalTest.requestAsync("GET", "/").then((result) => {
            return response.followAsync("GET", "index", "catalog");
        }).then((secondResponse) => {
            expect(secondResponse.statusCode).toBe(200);
        }).then(done, done);
    });


### `headerValue = result.getHeader(headerName)`

Calls `FunctionalTest`'s `getHeader()` method to scan the response's headers. Provided as a convenience.

    it("set a custom header", (done) => {
        functionalTest.requestAsync("GET", "/").then((result) => {
            expect(result.getHeader("X-Custom-Header")).toEqual("the value");
        }).then(done, done);
    });


### `mockRequest = result.createMockRequest(options)`

Creates the mock request. Exposed only for monkey patching. The mock request may not have a specific function or might not act in a necessary way, thus patching might be necessary.

For instance, the body is sent through this method via simulated events, and that is done asynchronously in order to better simulate a real-life situation.

Monkey patching is discussed elsewhere with an example.


### `mockResponse = result.createMockResponse(options)`

Creates the mock response. Only exposed to enable monkey patching, which is covered in a dedicated section in this documentation.


### `httpLinkHeader = result.parseLinks(linkHeader)`

Converts a string into an object for easier use internally. This is a method to get the functionality isolated and to allow for monkey patching. For instance, it may be desirable to use a different library to parse the link header and store the result on the response, perhaps in a location like `this.linksFromOtherLibrary`.

Monkey patching has its own topic in this documentation.


### `string = result.toString([colorize=true])`

Make a textual representation of the request and response. This calls a series of functions to generate the full string. Each function's result will be appended together along with a generated header (based on the method name).

You can add your own method by first adding it to `FunctionalTestResult.prototype` and then changing the `result.toStringMethods` array to include the method's name. If the method returns a string, it will be added to the output. If it returns an `Array` of strings, they will be joined by newlines. If it returns an empty `Array` it will still generate a header. Finally, returning `null` will omit the header.

    // Sample call
    console.log(result.toString());

This would generate the following output, whose long lines were manually trimmed.

    ----- Request #1 -----
    GET /
    Host: localhost

    ----- Response #1 -----
    200 OK
    Link: <_me_>; rel="self", </>; rel="up"; title="self-discovery", </health...
    Content-Type: text/plain
    Content-Length: 2

    ok
    ----- Response Links #1 -----
    self: <_me_>; rel=self
    up: </>; rel=up; title="self-discovery"
    service: </healthCheck>; rel=service; title="health-check"
    service: </registration>; rel=service; profile="/schema/registration/regi...


### `string = result.toStringRequest(colorize)`

Returns the request similar to how it would look when transferred over the network. See `toString()` for an example.


### `string = result.toStringResponse(colorize)`

Returns the response similar to how it would appear when transmitted over a network. See `toString()` for an example.


### `string = result.toStringResponseLinks(colorize)`

Shows the links from the `result.links` object for easier reading. Only has output if the links object is defined. Returns `null` and entirely skips this section when there are no links.



Monkey Patching
---------------

By monkey patching, one is able to add additional functionality or override any default behavior. In this example, we are patching the `FunctionalTest`'s `reformatRequestOptions` function. Because the object itself is exposed, we have access to its prototype and monkey patching is fairly straightforward.

    // Monkey patch reformatRequestOptions to change the default timeout
    // to 10 minutes instead of whatever the module uses.
    var FunctionalTest, originalReformat;

    FunctionalTest = require('functional-route-tester').FunctionalTest;
    originalReformat = FunctionalTest.prototype.reformatRequestOptions;
    FunctionalTest.prototype.reformatRequestOptions = function (options) {
        if (!options.timeoutMs) {
            options.timeoutMs = 600000;
        }

        originalReformat.call(this, options);
    }

*Note:* The 10-minute timeout will probably not be allowed to work with testing frameworks. They set a specific amount of time that any individual test may execute and it's extremely likely that 10 minutes is far too long to wait.


Development
-----------

This testing code has tests of its own in order to make sure it properly can simulate requests through different frameworks. It also conforms to a style guide as mentioned in [CONTRIBUTING.md](CONTRIBUTING.md). Use `npm test` to run these tests when submitting pull requests.

Support for other frameworks is encouraged! If you utilize some server module that isn't supported yet, pull requests are readily accepted.


License
-------

This software is licensed under a [MIT license][LICENSE] that contains additional non-advertising and patent-related clauses. [Read full license terms][LICENSE]


[codecov-badge]: https://img.shields.io/codecov/c/github/tests-always-included/functional-route-tester/master.svg
[codecov-link]: https://codecov.io/github/tests-always-included/functional-route-tester?branch=master
[dependencies-badge]: https://img.shields.io/david/tests-always-included/functional-route-tester.svg
[dependencies-link]: https://david-dm.org/tests-always-included/functional-route-tester
[devdependencies-badge]: https://img.shields.io/david/dev/tests-always-included/functional-route-tester.svg
[devdependencies-link]: https://david-dm.org/tests-always-included/functional-route-tester#info=devDependencies
[Express]: http://expressjs.com/
[Jasmine]: https://jasmine.github.io/
[jasmine-test-helpers]: https://github.com/tests-always-included/jasmine-test-helpers
[LICENSE]: LICENSE.md
[npm-badge]: https://img.shields.io/npm/v/functional-route-tester.svg
[npm-link]: https://npmjs.org/package/functional-route-tester
[Restify]: http://restify.com/
[Restiq]: https://github.com/andrasq/node-restiq
[travis-badge]: https://img.shields.io/travis/tests-always-included/functional-route-tester/master.svg
[travis-link]: http://travis-ci.org/tests-always-included/functional-route-tester
