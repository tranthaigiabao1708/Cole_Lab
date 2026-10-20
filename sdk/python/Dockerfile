# Base for every simulator evaluator image: runtime toolchain + cole_sim_sdk.
# Build: runner POST /images/build {"context": "sdk/python", "tag": "cole/sim-base:1"}
FROM cole/python-cpu:0.1
USER 0:0
COPY cole_sim_sdk /opt/cole/sdk/cole_sim_sdk
RUN chmod -R a+rX /opt/cole/sdk
USER 1000:1000
ENV PYTHONPATH=/opt/cole/sdk
WORKDIR /tmp
