import http from "k6/http";
import { Counter } from "k6/metrics";

const status200 = new Counter("status_200");
const status429 = new Counter("status_429");
const otherStatus = new Counter("other_status");

export const options = {
  vus: 1,
  iterations: 200,
};

export default function () {
  const url =
    "https://bag-karar-api.hsnckrdg.workers.dev/api/weather?mode=forecast&latitude=38.734&longitude=27.568";

  const response = http.get(url);

  if (response.status === 200) {
    status200.add(1);
  } else if (response.status === 429) {
    status429.add(1);
  } else {
    otherStatus.add(1);
  }
}