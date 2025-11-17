This repository provides a REST API server that you can run on your own private infrastructure.  
The server exposes HTTP endpoints that simplify interaction with the ObjectID smart contracts.

Each API call requires a set of common parameters:

- `seed`
- `creditToken`
- `OIDControllerCap` or `IotaControllerCap` (the identity objects)

In addition to these, each endpoint may require function-specific parameters.

All parameter values (except the `seed`) can be found in the **"Identity and Info"** page of the ObjectID dApp.

A Docker configuration is included to run the server behind your own URL and avoid CORS issues. You need to add the traefik container if you have not it already runing in your docker enviroment.
Please adapt the Docker and URL configuration to your specific deployment environment.
