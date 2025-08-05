import http from 'k6/http';
import { check, sleep } from 'k6';

export let options = {
    stages: [
        { duration: '30s', target: 1000 },  // ramp-up to 1000 users
        { duration: '3m', target: 1000 },   // stay at 1000 users for 3 minutes
        { duration: '30s', target: 0 },     // ramp-down to 0 users
    ],
};

export default function () {
    let res = http.get('http://localhost:3000/api/ping');  // replace with actual endpoint
    check(res, {
        'status is 200': (r) => r.status === 200,
    });
    sleep(1);
}

