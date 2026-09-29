import importlib

import pytest


def module():
    try:
        return importlib.import_module('server.labs.swupdate_length')
    except ModuleNotFoundError:
        pytest.fail('SWUpdate education model is not implemented')


@pytest.mark.parametrize('bits,n,vulnerable,fixed', [
    (32, 16, '4294967294', '0'), (32, 17, '4294967295', '1'), (32, 18, '0', '2'),
    (64, 16, '18446744073709551614', '0'), (64, 17, '18446744073709551615', '1'), (64, 18, '0', '2'),
])
def test_exact_unsigned_boundary_lengths(bits, n, vulnerable, fixed):
    m = module()
    value = m.LengthInput(10, n, True, True)
    assert m.calculate_length(value, patched=False, bits=bits).calculated_length == vulnerable
    assert m.calculate_length(value, patched=True, bits=bits).calculated_length == fixed


@pytest.mark.parametrize('n,stage,found,status,length', [
    (15, True, True, 'waiting', None), (16, False, True, 'skipped', None),
    (16, True, False, 'searching', '0'), (20, True, False, 'searching', '4'),
])
def test_guard_and_other_branch_do_not_execute_vulnerable_subtraction(n, stage, found, status, length):
    m = module()
    result = m.calculate_length(m.LengthInput(10, n, stage, found), patched=False, bits=64)
    assert (result.arithmetic_status, result.calculated_length) == (status, length)
    if length is None:
        assert result.mathematical_difference is None


def test_underflow_fault_is_simulated_and_other_model_is_healthy():
    m = module()
    broken = m.SwupdateModel(patched=False, bits=64)
    healthy = m.SwupdateModel(patched=True, bits=64)
    value = m.LengthInput(10, 16, True, True)
    result = broken.evaluate(value)
    assert result.state['mathematicalDifference'] == -2
    assert result.state['uploadStatus'] == 'failed'
    assert result.state['simulatedServiceStatus'] == 'faulted'
    assert result.state['installStatus'] == 'not_simulated'
    assert broken.evaluate(value).code == 'SERVICE_UNAVAILABLE'
    assert broken.finish_upload().code == 'SERVICE_UNAVAILABLE'
    assert healthy.evaluate(value).state['calculatedLength'] == '0'
    assert healthy.finish_upload().code == 'UPLOAD_NOT_READY'


@pytest.mark.parametrize('n,stage,found', [(15, True, True), (16, True, True), (20, True, False), (20, False, True)])
def test_finish_uses_latest_evaluation_not_previous_safe_chunk(n, stage, found):
    m = module()
    lab = m.SwupdateModel(patched=True, bits=64)
    lab.evaluate(m.LengthInput(10, 20, True, True))
    lab.evaluate(m.LengthInput(10, n, stage, found))
    assert lab.finish_upload().code == 'UPLOAD_NOT_READY'


def test_finish_only_completes_mock_upload_not_install():
    m = module()
    lab = m.SwupdateModel(patched=True, bits=32)
    assert lab.finish_upload().code == 'UPLOAD_NOT_READY'
    lab.evaluate(m.LengthInput(10, 20, True, True))
    result = lab.finish_upload()
    assert result.code == 'UPLOAD_COMPLETED'
    assert result.state['installStatus'] == 'not_simulated'
    assert lab.finish_upload().code == 'ALREADY_COMPLETED'
    assert lab.evaluate(m.LengthInput(10, 20, True, True)).code == 'ALREADY_COMPLETED'
    copy = lab.snapshot()
    copy['lastInput']['bufferLength'] = 0
    assert lab.snapshot()['lastInput']['bufferLength'] == 20


@pytest.mark.parametrize('b,n,bits', [(0, 16, 64), (65, 16, 64), (10, -1, 64), (10, 257, 64), (10, True, 64), (10, 16.5, 64), (10, 16, 8)])
def test_model_refuses_unbounded_or_non_integer_lengths(b, n, bits):
    m = module()
    with pytest.raises(ValueError):
        m.calculate_length(m.LengthInput(b, n, True, True), patched=False, bits=bits)
