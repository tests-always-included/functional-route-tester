"use strict";

var express, routes;

/**
 * How to send a response to this framework.
 *
 * @param {HttpServerResposne} res
 * @param {number} statusCode
 * @param {Object} headers
 * @param {*} body undefined is allowed
 */
function sendToExpress(res, statusCode, headers, body) {
    Object.keys(headers).forEach((headerKey) => {
        res.append(headerKey, headers[headerKey]);
    });
    res.status(statusCode);
    res.send(body);
}


express = require("express");
routes = require("./fixture/routes");

describe("express", () => {
    var functionalTest;

    beforeEach(() => {
        return jasmine.expressFunctionalTestAsync(() => {
            var app;

            app = express();
            routes.forEach((routeInfo) => {
                app[routeInfo.method.toLowerCase()](routeInfo.path, routeInfo.routeFactory(sendToExpress, "express"));
            });

            // Listen to port -1 because we shouldn't be allowed to do this
            // if this was really listening.
            app.listen(-1);
        }).then((theNewFunctionalTest) => {
            functionalTest = theNewFunctionalTest;
        });
    });
    it("gets /", () => {
        return functionalTest.requestAsync("GET", "/").then((result) => {
            expect(result.statusCode).toBe(200);
            expect(result.body).toBe("this works");
        });
    });
    it("reflects with /reflect", () => {
        return functionalTest.requestAsync("POST", "/reflect", {
            body: "This is my body",
            headers: {
                "Content-Type": "anything I like",
                Asleep: "no, just reflecting on the day, ignore the snoring"
            }
        }).then((result) => {
            expect(result.body).toEqual("This is my body");
            expect(result.getHeader("content-type")).toEqual("anything I like");
            expect(result.getHeader("ASLEEP")).toEqual("no, just reflecting on the day, ignore the snoring");
        });
    });
    it("generates a string without links", () => {
        return functionalTest.requestAsync("GET", "/").then((result) => {
            var chunks;

            chunks = result.toString(false).split(/-----/);

            expect(chunks[0]).toEqual("");
            expect(chunks[1]).toMatch(/^ Request #[0-9]+ $/);
            expect(chunks[2]).toEqual(`
GET /
Host: localhost

`);
            expect(chunks[3]).toMatch(/^ Response #[0-9]+ $/);
            expect(chunks[4].replace(/^ETag: .*$/m, "ETAG REMOVED")).toEqual(`
200 OK
X-Powered-By: Express
Content-Type: text/plain; charset=utf-8
Content-Length: 10
ETAG REMOVED

this works`);
            expect(chunks.length).toEqual(5);
        });
    });
    it("generates a string with links", () => {
        return functionalTest.requestAsync("POST", "/reflect", {
            headers: {
                Link: "</uri>; rel=x"
            }
        }).then((result) => {
            var chunks;

            chunks = result.toString(false).split(/-----/);

            expect(chunks[0]).toEqual("");
            expect(chunks[1]).toMatch(/^ Request #[0-9]+ $/);
            expect(chunks[2]).toEqual(`
POST /reflect
Link: </uri>; rel=x
Host: localhost

`);
            expect(chunks[3]).toMatch(/^ Response #[0-9]+ $/);
            expect(chunks[4].replace(/^ETag: .*$/m, "ETAG REMOVED")).toEqual(`
200 OK
X-Powered-By: Express
link: </uri>; rel=x
host: localhost
Content-Type: application/json

{}
`);
            expect(chunks[5]).toMatch(/^ Response Links #[0-9]+ $/);
            expect(chunks[6]).toEqual(`
x: </uri>; rel=x`);
            expect(chunks.length).toEqual(7);
        });
    });
});
