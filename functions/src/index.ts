'use strict';

const functions = require('firebase-functions');
const { WebhookClient } = require('dialogflow-fulfillment');
const { Card, Suggestion } = require('dialogflow-fulfillment');
const { List, Permission, BasicCard, Button } = require('actions-on-google');
const request = require('request');

process.env.DEBUG = 'dialogflow:debug'; // enables lib debugging statements

exports.dialogflowFirebaseFulfillment = functions.https.onRequest((request: any, response: any) => {
    const agent = new WebhookClient({ request, response });

    function backendStatus(agent: any) {
        agent.add(`Backend is up`);
    }

    function userId(agent: any) {
        let conv = agent.conv();
        conv.ask(conv.request.user.userId);
        agent.add(conv);
    }

    function listOrders(agent: any) {
        const conv = agent.conv();
        conv.ask('Please click on the order you want to replace');
        // Create a list
        conv.ask(new List({
            title: 'Orders List',
            items: {
                // Add the first item to the list
                '006-7950-668517': {
                    title: '006-7950-668517'
                },
                // Add the second item to the list
                '006-8742-668523': {
                    title: '006-8742-668523'
                },
                // Add the third item to the list
                '006-1234-654321': {
                    title: '006-1234-654321'
                },
            },
        }));
        agent.add(conv);
    }

    function placeOrder(agent: any) {
        agent.add(agent.parameters['Order_ID']);
    }

    function actionsIntentOPTION(agent: any) {
        let conv = agent.conv();
        let response = 'You have selected ' + conv.arguments.parsed.input.OPTION;
        agent.add(response);
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
        // const latitude = conv.device.location.coordinates.latitude;
        // const longitude = conv.device.location.coordinates.longitude;

        const mapUrl1 = "https://www.google.com/maps/search/?api=1&query=" + 12.971599 + "," + 77.594566;

        conv.ask("This is the map for the nearest dropoff location");
        conv.ask(new BasicCard({
            title: "Direction",
            text: "Directions for the nearest dropoff location",
            buttons: new Button({
                url: mapUrl1,
                title: 'Directions'
            }),
            display: "DEFAULT"
        }))
        agent.add(conv);
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
    intentMap.set('Test Api', testApi);
    agent.handleRequest(intentMap);
});

function callApi() {
    var options = {
        url: 'https://jsonplaceholder.typicode.com/posts/1',
        headers: {
            'User-Agent': 'request'
        }
    };
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