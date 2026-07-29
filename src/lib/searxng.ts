import axios from "axios";

type SearchOptions = {
  language?: string;
  engines?: string[];
};

export async function searchSearxng(
  query: string,
  options: SearchOptions = {}
) {
  const { language = "en", engines = [] } = options;

  const response = await axios.get(
    `${process.env.SEARXNG_URL}/search`,
    {
      params: {
        q: query,
        format: "json",
        language,
        engines: engines.join(","),
      },
    }
  );

  return response.data;
}

