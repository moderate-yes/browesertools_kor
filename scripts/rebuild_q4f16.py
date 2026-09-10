import sys

import onnx
from onnxruntime.transformers import float16


source_path, target_path = sys.argv[1:3]
model = onnx.load(source_path, load_external_data=False)
converted = float16.convert_float_to_float16(
    model,
    keep_io_types=True,
    disable_shape_infer=False,
)

available = {value.name for value in converted.graph.input}
available.update(value.name for value in converted.graph.initializer)
pending = list(converted.graph.node)
ordered = []
while pending:
    next_pending = []
    progressed = False
    for node in pending:
        if all(not name or name in available for name in node.input):
            ordered.append(node)
            available.update(node.output)
            progressed = True
        else:
            next_pending.append(node)
    if not progressed:
        missing = sorted({name for node in next_pending for name in node.input if name and name not in available})
        raise RuntimeError(f"Unable to topologically sort graph; missing inputs: {missing[:10]}")
    pending = next_pending
del converted.graph.node[:]
converted.graph.node.extend(ordered)

onnx.checker.check_model(converted)
onnx.save(converted, target_path)
print(target_path)
