// Link as an example in the pinned KUKSA databroker-examples package.
// This is a local follow-up experiment on a VSS door signal, not the
// publicly demonstrated CargoVersion target and not a physical door control.
use std::io::{self, Write};
use std::time::Duration;

use databroker_proto::kuksa::val::v2::open_provider_stream_request::Action;
use databroker_proto::kuksa::val::v2::open_provider_stream_response;
use databroker_proto::kuksa::val::v2::value::TypedValue;
use databroker_proto::kuksa::val::v2::{
    DataType, Datapoint, GetProviderValueResponse, OpenProviderStreamRequest,
    ProvideSignalRequest, SampleInterval, Value,
};
use kuksa_common::{ClientError, ClientTraitV2};
use kuksa_val_v2::KuksaClientV2;
use tokio::io::{AsyncBufReadExt, BufReader};
use tonic::Code;

const TARGET_PATH: &str = "Vehicle.Cabin.Door.Row1.DriverSide.IsOpen";

fn emit(
    seq: u64,
    action: &str,
    outcome: &str,
    value: &str,
    registration: &str,
    code: &str,
    signal_type: &str,
    signal_id: &str,
) -> io::Result<()> {
    println!(
        "RESULT\t{seq}\t{action}\t{outcome}\t{value}\t{registration}\t{code}\t{signal_type}\t{signal_id}"
    );
    io::stdout().flush()
}

fn door_value(datapoint: Option<Datapoint>) -> Result<Option<bool>, &'static str> {
    let typed = datapoint.and_then(|dp| dp.value).and_then(|value| value.typed_value);
    match typed {
        Some(TypedValue::Bool(value)) => Ok(Some(value)),
        None => Ok(None),
        _ => Err("NonBooleanValue"),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let endpoint = match std::env::var("KUKSA_REPRO_PORT").as_deref() {
        Ok("55565") => "http://127.0.0.1:55565",
        Ok("55566") => "http://127.0.0.1:55566",
        _ => return Err("only the pinned loopback ports are allowed".into()),
    };
    let reader_token = std::fs::read_to_string("jwt/read-all.token")?;
    let mut reader = KuksaClientV2::from_host(endpoint);
    reader.basic_client.set_access_token(reader_token.trim())?;
    let mut signal_id: Option<i32> = None;
    let mut provider_worker: Option<tokio::task::JoinHandle<()>> = None;

    println!("READY");
    io::stdout().flush()?;
    let mut lines = BufReader::new(tokio::io::stdin()).lines();
    while let Some(line) = lines.next_line().await? {
        if line.len() > 256 {
            return Err("command too long".into());
        }
        let fields: Vec<&str> = line.trim_end_matches('\r').split('\t').collect();
        let (action, seq) = match fields.as_slice() {
            ["METADATA", seq] => ("metadata", seq.parse::<u64>()?),
            ["READ", seq] => ("read", seq.parse::<u64>()?),
            ["REGISTER", seq, _, _] => ("register", seq.parse::<u64>()?),
            _ => return Err("invalid fixed command".into()),
        };
        if seq == 0 {
            return Err("invalid command sequence".into());
        }
        match action {
            "metadata" => {
                let response = reader
                    .list_metadata((TARGET_PATH.to_owned(), "*".to_owned()))
                    .await?;
                let signal = response
                    .iter()
                    .find(|item| item.path == TARGET_PATH)
                    .ok_or("door metadata not returned by broker")?;
                if signal.data_type != DataType::Boolean as i32 {
                    return Err("door metadata is not boolean".into());
                }
                signal_id = Some(signal.id);
                emit(seq, action, "ok", "-", "-", "OK", "boolean", &signal.id.to_string())?;
            }
            "read" => {
                let response = tokio::time::timeout(
                    Duration::from_secs(5), reader.get_value(TARGET_PATH.to_owned()),
                )
                .await;
                match response {
                    Ok(Ok(datapoint)) => match door_value(datapoint) {
                        Ok(Some(true)) => emit(seq, action, "ok", "true", "-", "OK", "-", "-")?,
                        Ok(Some(false)) => emit(seq, action, "ok", "false", "-", "OK", "-", "-")?,
                        Ok(None) => emit(seq, action, "ok", "null", "-", "OK", "-", "-")?,
                        Err(code) => emit(seq, action, "error", "null", "-", code, "-", "-")?,
                    },
                    Ok(Err(error)) => {
                        let code = match error {
                            ClientError::Status(status) => format!("{:?}", status.code()),
                            ClientError::Connection(_) => "Unavailable".to_owned(),
                            ClientError::Function(_) => "FailedPrecondition".to_owned(),
                        };
                        emit(seq, action, "error", "null", "-", &code, "-", "-")?;
                    }
                    Err(_) => emit(seq, action, "error", "null", "-", "DeadlineExceeded", "-", "-")?,
                }
            }
            "register" => {
                let [_, _, role, open_text] = fields.as_slice() else {
                    return Err("invalid register command".into());
                };
                let token_file = match *role {
                    "read" => "jwt/read-all.token",
                    "provide" => "jwt/provide-all.token",
                    _ => return Err("invalid provider role".into()),
                };
                let provided_open = match *open_text {
                    "true" => true,
                    "false" => false,
                    _ => return Err("invalid boolean input".into()),
                };
                let Some(id) = signal_id else {
                    emit(seq, action, "error", "-", "false", "FailedPrecondition", "-", "-")?;
                    continue;
                };
                if provider_worker.is_some() {
                    emit(seq, action, "error", "-", "false", "AlreadyExists", "-", "-")?;
                    continue;
                }
                let provider_token = std::fs::read_to_string(token_file)?;
                let mut provider = KuksaClientV2::from_host(endpoint);
                provider.basic_client.set_access_token(provider_token.trim())?;
                let mut stream = provider.open_provider_stream(None).await?;
                stream
                    .sender
                    .send(OpenProviderStreamRequest {
                        action: Some(Action::ProvideSignalRequest(ProvideSignalRequest {
                            signals_sample_intervals: [(
                                id,
                                SampleInterval { interval_ms: 0 },
                            )]
                            .into_iter()
                            .collect(),
                        })),
                    })
                    .await?;
                let response = tokio::time::timeout(
                    Duration::from_secs(5), stream.receiver_stream.message(),
                )
                .await;
                match response {
                    Ok(Err(status)) if status.code() == Code::PermissionDenied => {
                        emit(seq, action, "denied", "-", "false", "PermissionDenied", "-", "-")?;
                    }
                    Ok(Ok(Some(message))) => match message.action {
                        Some(open_provider_stream_response::Action::ProvideSignalResponse(_)) => {
                            emit(seq, action, "ok", "-", "true", "OK", "-", "-")?;
                            provider_worker = Some(tokio::spawn(async move {
                                loop {
                                    let response = stream.receiver_stream.message().await;
                                    let Ok(Some(message)) = response else { break };
                                    if let Some(
                                        open_provider_stream_response::Action::GetProviderValueRequest(request),
                                    ) = message.action
                                    {
                                        let result = stream.sender.send(OpenProviderStreamRequest {
                                            action: Some(Action::GetProviderValueResponse(
                                                GetProviderValueResponse {
                                                    request_id: request.request_id,
                                                    entries: [(
                                                        id,
                                                        Datapoint {
                                                            timestamp: None,
                                                            value: Some(Value {
                                                                typed_value: Some(TypedValue::Bool(provided_open)),
                                                            }),
                                                        },
                                                    )]
                                                    .into_iter()
                                                    .collect(),
                                                },
                                            )),
                                        }).await;
                                        if result.is_err() { break; }
                                    }
                                }
                            }));
                            tokio::time::sleep(Duration::from_millis(200)).await;
                        }
                        _ => emit(seq, action, "error", "-", "false", "UnexpectedResponse", "-", "-")?,
                    },
                    Ok(Err(status)) => emit(
                        seq, action, "error", "-", "false",
                        &format!("{:?}", status.code()), "-", "-",
                    )?,
                    Ok(Ok(None)) => emit(seq, action, "error", "-", "false", "StreamClosed", "-", "-")?,
                    Err(_) => emit(seq, action, "error", "-", "false", "DeadlineExceeded", "-", "-")?,
                }
            }
            _ => unreachable!(),
        }
    }
    if let Some(worker) = provider_worker {
        worker.abort();
    }
    Ok(())
}
