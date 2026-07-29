const computeSimilarity = (a: number[], b: number[]) => {
  const dotProduct = a.reduce((sum, value, index) => {
    return sum + value * (b[index] ?? 0);
  }, 0);

  const magnitudeA = Math.sqrt(
    a.reduce((sum, value) => sum + value * value, 0)
  );

  const magnitudeB = Math.sqrt(
    b.reduce((sum, value) => sum + value * value, 0)
  );

  return dotProduct / (magnitudeA * magnitudeB);
};

export default computeSimilarity;