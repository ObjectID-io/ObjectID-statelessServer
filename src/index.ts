import express from "express";
import cors from "cors";
import router from "./routes";

const port = 3002;
const app = express();

app.use(express.json());
app.use(
  cors({
    origin: "*",
    methods: ["POST", "GET", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(cors());

app.use(router);

app.listen(port, () => console.log(`🚀 Server in ascolto su porta ${port}`));
