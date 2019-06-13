'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');
const { List, Permission, BasicCard, Button, Table } = require('actions-on-google');
const request = require('request');
const sgMail = require('@sendgrid/mail');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request: any, response: any) => {
    const agent = new WebhookClient({ request, response });

    function backendStatus(agent: any) {
        agent.add(`The Backend is up`);
    }

    function userId(agent: any) {
        let conv = agent.conv();
        conv.ask(conv.request.user.userId);
        agent.add(conv);
    }

    function listOrders(agent: any) {
        const conv = agent.conv();
        return getRecentOrders(conv.request.user.userId)
            .then((data) => {
                var parsedObject = JSON.parse(JSON.stringify(data));

                conv.ask('Please click on the order you want to reorder');
                // Create a list
                let items: any = {};
                for (var i = 0; i < parsedObject.length; i++) {
                    items[parsedObject[i].orderCode] = {
                        title: parsedObject[i].orderCode,
                        description: 'Placed On: ' + parsedObject[i].placedOn
                    }
                }

                conv.ask(new List({
                    title: 'Orders List',
                    items: items
                }));
                agent.add(conv);
            });
    }

    function listFavoriteOrders(agent: any) {
        const conv = agent.conv();

        return getFavoriteOrders(conv.request.user.userId)
            .then((data) => {
                var parsedObject = JSON.parse(JSON.stringify(data));

                conv.ask('Please click on the Favorite order you want to replace');

                // Create a list
                let items: any = {};
                for (var i = 0; i < parsedObject.length; i++) {
                    items[parsedObject[i].name] = {
                        title: parsedObject[i].name
                    }
                }

                conv.ask(new List({
                    title: 'Favorite Orders List',
                    items: items
                }));
                agent.add(conv);
            });
    }

    function SampleDetails(agent: any) {
        const conv = agent.conv();
        return getSampleDetails(agent.parameters['Order_ID'])
            .then((data) => {
                var parsedObject = JSON.parse(JSON.stringify(data));

                let rows = [];
                for (var i = 0; i < parsedObject.length; i++) {
                    rows.push([parsedObject[i].sampleCode, parsedObject[i].sampleStatus, parsedObject[i].conformity])
                }

                conv.ask('Sample Details');
                conv.ask(new Table({
                    dividers: true,
                    columns: ['Sample Code', 'Sample Status', 'Conformity'],
                    rows: rows,
                }))
                agent.add(conv);
            });
    }

    function actionsIntentOPTION(agent: any) {
        let conv = agent.conv();
        if (conv.request.conversation.conversationToken === '["order"]') {
            return createOrder(conv.request.user.userId, conv.arguments.parsed.input.OPTION)
                .then((data) => {
                    conv.ask("The order has been placed with order id " + data);

                    // getUserInfo(conv.request.user.userId)
                    //     .then((data) => {
                    //         sendMail('bhavan.reddy1997@gmail.com',
                    //             'bhavan.reddy1997@gmail.com',
                    //             'Order Has been Created',
                    //             'Order Has been Created',
                    //             'Order Has been Created');

                    //         conv.ask(`Mail has been sent to your registered Mail Id, Please Check`);
                    //         agent.add(conv);
                    //     });
                    agent.add(conv);
                });
        }
        else {
            return createFavoriteOrder(conv.request.user.userId, conv.arguments.parsed.input.OPTION)
                .then((data) => {
                    conv.ask("The order has been placed with order id " + data);

                    // getUserInfo(conv.request.user.userId)
                    //     .then((data) => {
                    //         agent.add('Favorite Order Has been placed');
                    //         sendMail('bhavan.reddy1997@gmail.com',
                    //             'bhavan.reddy1997@gmail.com',
                    //             'Favorite Order Has been Created',
                    //             'Favorite Order Has been Created',
                    //             'Favorite Order Has been Created');

                    //         conv.ask(`Mail has been sent to your registered Mail Id, Please Check`);
                    //     });

                    agent.add(conv);

                });
        }
    }

    function placeOrder(agent: any) {
        let conv = agent.conv();
        agent.add(conv);
        return createOrder(conv.request.user.userId, agent.parameters['Order_ID'])
            .then((data) => {
                conv.ask("The order has been placed with order id " + data);

                // getUserInfo(conv.request.user.userId)
                //     .then((data) => {
                //         sendMail('bhavan.reddy1997@gmail.com', 'bhavan.reddy1997@gmail.com', 'Order Has been Created', 'Order Has been Created', 'Order Has been Created');
                //         conv.ask(`Mail has been sent to your registered Mail Id, Please Check`);
                //         agent.add(conv);
                //     });

                agent.add(conv);
            });
    }

    function dropDownLocation(agent: any) {
        const conv = agent.conv();
        conv.data.requestedPermission = 'DEVICE_PRECISE_LOCATION';
        conv.ask(new Permission({
            context: 'I need to access your location',
            permissions: conv.data.requestedPermission
        }));
        return agent.add(conv);
    }

    function dropDownLocationReply(agent: any) {
        const conv = agent.conv();
        const latitude = conv.device.location.coordinates.latitude;
        const longitude = conv.device.location.coordinates.longitude;

        return getDropOffLocation(latitude, longitude)
            .then((data) => {
                var parsedObject = JSON.parse(JSON.stringify(data));
                conv.ask('Nearest DropOff Location');
                const mapUrl = "https://www.google.com/maps/search/?api=1&query=" + parsedObject[0].latitude + "," + parsedObject[0].longitude;

                conv.ask(new BasicCard({
                    title: parsedObject[0].labName,
                    text: "Open From : " + parsedObject[0].accessTimeGeneralFrom + " To : " + parsedObject[0].accessTimeGeneralTo,
                    buttons: new Button({
                        url: mapUrl,
                        title: 'Map'
                    }),
                    display: "DEFAULT"
                }));
                agent.add(conv);
            });

    }

    function testMail(agent: any) {
        sendMail('bhavan.reddy1997@gmail.com', 'bhavan.reddy1997@gmail.com', 'Test Mail', 'Testing mail', 'Test Mail');
        agent.add(`Mail has been sent registered Mail Id`);
    }

    function testApi(agent: any) {
        return callApi().then((data) => {
            agent.add(JSON.stringify(data));
        });
    }

    // Run the proper function handler based on the matched Dialogflow intent name
    let intentMap = new Map();
    intentMap.set('Backend Status', backendStatus);
    intentMap.set('UserID', userId);
    intentMap.set('List Orders', listOrders);
    intentMap.set('Place Order', placeOrder);
    intentMap.set('actions.intent.OPTION', actionsIntentOPTION);
    intentMap.set('DropDown Location', dropDownLocation);
    intentMap.set('DropDown Location Reply', dropDownLocationReply);
    intentMap.set('List Favorite Orders', listFavoriteOrders);
    intentMap.set('Test Email', testMail);
    intentMap.set('Test Api', testApi);
    intentMap.set('Sample Details', SampleDetails);
    agent.handleRequest(intentMap);
});

function sendMail(to: string, from: string, subject: string, text: string, html: string) {
    //Uncomment below code after getting your api key from https://sendgrid.com/pricing/
    //sgMail.setApiKey(apiKey);
    const msg = {
        to: to,
        from: from,
        subject: subject,
        text: text,
        html: html
    };
    sgMail.send(msg);
}

function getUserInfo(userId: string) {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/user/ga?gaId=' + userId,
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnApiPromise(options);
}

function callApi() {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/orders',
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnApiPromise(options);
}

function getDropOffLocation(latitude: any, longitude: any) {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/drop-off-locations?lat=' + latitude + '&log=' + longitude,
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnApiPromise(options);
}

function getRecentOrders(userId: string) {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/orders/recent?gaId=' + userId,
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnApiPromise(options);
}

function getFavoriteOrders(userId: string) {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/orders/favorite-orders?gaId=' + userId,
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnApiPromise(options);
}

function createOrder(userId: string, orderId: string) {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/orders/from-order?gaId=' + userId + '&orderId=' + orderId,
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnStringApi(options);
}

function createFavoriteOrder(userId: string, orderId: string) {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/orders/from-favorite?gaId=' + userId + '&orderId=' + orderId,
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnStringApi(options);
}

function getSampleDetails(userId: string) {
    var options = {
        url: 'https://eoleco.azurewebsites.net/api/orders/samples?orderCode=' + userId,
        headers: {
            'User-Agent': 'request'
        }
    };
    return returnApiPromise(options);
}

function returnApiPromise(options: any) {
    // Return new promise 
    return new Promise(function (resolve, reject) {
        // Do async job
        request.get(options, function (err: any, resp: any, body: any) {
            if (err) {
                reject(err);
            } else {
                resolve(JSON.parse(body));
            }
        });
    });
}

function returnStringApi(options: any) {
    // Return new promise 
    return new Promise(function (resolve, reject) {
        // Do async job
        request.get(options, function (err: any, resp: any, body: any) {
            if (err) {
                reject(err);
            } else {
                resolve(body);
            }
        });
    });
}
