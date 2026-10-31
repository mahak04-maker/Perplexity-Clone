// import express from "express";
// import dotenv from "dotenv";
// import testRoute from "./routes/test.js";
// import searchRoute from "./routes/search.js";
// import cors from "cors";

// dotenv.config();

// const app = express();

// app.use(cors());
// app.use(express.json());

// app.use("/api/search", searchRoute);
// app.use("/api/test", testRoute);

// app.get("/", (req, res) => {
//   res.send("Perplexity Clone API Running ");
// });

// const PORT = 3000;

// app.listen(PORT, () => {
//   console.log(`Server running on http://localhost:${PORT}`);
// });


import express from "express";
import dotenv from "dotenv";
import testRoute from "./routes/test.js";
import searchRoute from "./routes/search.js";
import cors from "cors";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.use("/api/search", searchRoute);
app.use("/api/test", testRoute);

app.get("/", (req, res) => {
  res.send("Perplexity Clone API Running");
});

const PORT = process.env.PORT || 3000;

app.listen(Number(PORT), "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
