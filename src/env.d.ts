type Bindings = {
  BROWSER: {
    quickAction(type: string, params: { url: string }): Promise<Response>;
  };
  BUCKET: R2Bucket;
  WORKFLOW: {
    create(params: { id?: string; params: { url: string } }): Promise<{ id: string }>;
  };
};
