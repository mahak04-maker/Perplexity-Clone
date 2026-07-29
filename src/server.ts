import express from "express";
import dotenv from "dotenv";
import testRoute from "./routes/test.js";
import searchRoute from "./routes/search.js";

dotenv.config();

const app = express();

app.use(express.json());
app.use("/api/search", searchRoute);
app.use("/api/test", testRoute);

app.get("/", (req, res) => {
  res.send("Perplexity Clone API Running ");
});

const PORT = 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});