# Computer Communications - Network Monitoring System (NMS)

## Description
The **Network Monitoring System (NMS)** is a project developed for the **Computer Communications** course. The system is designed to monitor network devices and links, collect metrics, and generate alerts in case of anomalies. It is implemented as a distributed application with a client-server architecture, where **NMS_Agents** collect metrics and report them to a centralized **NMS_Server**. The system uses two custom application protocols, **NetTask** (UDP-based) and **AlertFlow** (TCP-based), to ensure efficient and reliable communication. Additionally, **security measures** were implemented using the **Diffie-Hellman key exchange** to secure communication between NMS_Agents and the NMS_Server.

### 🎯 Purpose:
The primary objective of this project is to apply **Computer Communications** concepts, including:
- Development of custom application protocols (NetTask and AlertFlow)
- Use of UDP and TCP sockets for communication
- Implementation of flow control, sequence numbers, and retransmission mechanisms over UDP
- Distributed system design for network monitoring
- Real-time metric collection and alert generation
- **Secure communication** using the **Diffie-Hellman key exchange** for encryption (Not in the scope of the subject)

### 🚀 Key Features:
- **Metric Collection**: NMS_Agents collect various network and device metrics such as CPU usage, RAM usage, interface statistics, bandwidth, latency, jitter, and packet loss.
- **Task Management**: NMS_Server assigns tasks to NMS_Agents via a JSON configuration file, specifying which metrics to collect and how often.
- **Real-Time Monitoring**: NMS_Agents periodically send collected metrics to the NMS_Server using the **NetTask** protocol (UDP).
- **Alert System**: NMS_Agents notify the NMS_Server of critical changes in device or network metrics (e.g., interface failures, high CPU usage) using the **AlertFlow** protocol (TCP).
- **Resilient Communication**: The NetTask protocol implements mechanisms like sequence numbers, acknowledgments, and retransmission to handle network failures and ensure reliable communication.
- **Secure Communication**: **Diffie-Hellman key exchange** was implemented to establish secure communication channels between NMS_Agents and the NMS_Server, ensuring that data is encrypted and protected from eavesdropping.
- **Data Storage**: NMS_Server stores on a database all collected metrics and alerts for later analysis.
- **User Interface**: NMS_Server provides an interface for network managers to view metrics and alerts.

## 📚 Learning Outcomes
- **Custom Protocol Development**: Gained experience in designing and implementing application-layer protocols (NetTask and AlertFlow).
- **Socket Programming**: Used UDP and TCP sockets for communication between NMS_Agents and NMS_Server.
- **Distributed Systems**: Learned how to design and implement a distributed system for device and network monitoring.
- **Error Handling and Resilience**: Implemented mechanisms like sequence numbers, acknowledgments, and retransmission to ensure reliable communication over UDP.
- **Network Metrics**: Collected and analyzed various network metrics using tools like `ping`, `iperf`, and `ip` commands.
- **JSON Parsing**: Processed JSON configuration files to assign tasks to NMS_Agents.
- **Security Implementation**: Applied the **Diffie-Hellman key exchange** to secure communication, ensuring data confidentiality and integrity.

## 🚧 Areas for Improvement
- **Enhanced Error Handling**: While the system implements basic error handling (e.g., retransmission, sequence numbers), further improvements could be made to make the communication more robust. For example:
  - Adding more sophisticated **timeout and retry mechanisms** to handle intermittent network issues.
  - Calculate timeout values in real time by estimating RTT times.
  - Using **checksums** or **cyclic redundancy checks (CRC)** to detect and correct errors in transmitted data.
- **Scalability**: The system could be further optimized to handle a larger number of NMS_Agents simultaneously, possibly by introducing load balancing or distributed server architectures.
- **Security Enhancements**: While Diffie-Hellman provides a strong foundation for secure communication, additional security measures could be added, such as:
  - **CA's**: A certificate authority (CA) is a trusted entity that issues Secure certificates to prove authenticity.

## 👨‍💻 Contributors
- **Alex Araújo Sá** - [Alex Sá](https://github.com/alexaraujosa)
- **Paulo Alexandre Rodrigues Ferreira** - [Paulo Ferreira](https://github.com/pauloarf)
- **Rafael Santos Fernandes** - [DarkenLM](https://github.com/DarkenLM)

## 🛠️ Technologies Used
- **Programming Language**: javascript
- **Network Emulator**: CORE 7.5
- **Communication Protocols**: UDP (NetTask), TCP (AlertFlow)
- **Security Protocol**: **Diffie-Hellman key exchange** for secure communication
- **Network Tools**: `ping`, `iperf`, `ip` commands
- **Data Handling**: JSON for task configuration, file-based storage for metrics and alerts
- **Development Tools**: Wireshark (for network analysis)
- **Data Persistance**: mongoDB
