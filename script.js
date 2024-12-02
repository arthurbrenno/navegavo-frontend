// Seleção de elementos

const HOST = "https://accurately-great-mallard.ngrok-free.app:8000";

const imageInput = document.getElementById('image-input');
const uploadButton = document.getElementById('upload-button');
const recordButton = document.getElementById('record-button');
const recordButtonText = document.getElementById('record-button-text');
const chatWindow = document.getElementById('chat-window');

let uploadedImage = null;
let mediaRecorder;
let audioChunks = [];
let isRecording = false;

// Evento para abrir o seletor de arquivos ao clicar no botão de upload
uploadButton.addEventListener('click', () => {
  imageInput.click();
});

// Evento após selecionar a imagem
imageInput.addEventListener('change', () => {
  if (imageInput.files.length > 0) {
    uploadedImage = imageInput.files[0];
    addImagePreview(uploadedImage);
  }
});

// Função para adicionar a pré-visualização da imagem no chat
function addImagePreview(imageFile) {
  const reader = new FileReader();
  reader.onloadend = function () {
    const imageElement = document.createElement('img');
    imageElement.src = reader.result;
    imageElement.alt = 'Imagem enviada';
    imageElement.className = 'message user-message mb-2';
    chatWindow.appendChild(imageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  };
  reader.readAsDataURL(imageFile);
}

// Evento de clique no botão de gravação
recordButton.addEventListener('click', () => {
  if (!isRecording) {
    startRecording();
  } else {
    stopRecording();
  }
});

// Função para iniciar a gravação
function startRecording() {
  navigator.mediaDevices.getUserMedia({ audio: true })
    .then(stream => {
      isRecording = true;
      mediaRecorder = new MediaRecorder(stream);
      mediaRecorder.start();
      recordButton.classList.add('recording');
      recordButtonText.innerText = 'Gravando...';

      mediaRecorder.addEventListener('dataavailable', event => {
        audioChunks.push(event.data);
      });

      mediaRecorder.addEventListener('stop', () => {
        const audioBlob = new Blob(audioChunks, { type: 'audio/mp3' });
        audioChunks = [];
        isRecording = false;
        recordButton.classList.remove('recording');
        recordButtonText.innerText = 'Pressione para falar';
        processAudio(audioBlob);
      });
    })
    .catch(error => {
      console.error('Erro ao acessar o microfone:', error);
      alert('Não foi possível acessar o microfone. Verifique as permissões do seu navegador.');
    });
}

// Função para parar a gravação
function stopRecording() {
  mediaRecorder.stop();
}

// Função para processar o áudio gravado
function processAudio(audioBlob) {
  // Exibe uma mensagem de carregamento
  addMessageToChat('Processando sua pergunta...', 'user-message');

  // Envia o áudio para a API de transcrição
  const formData = new FormData();
  formData.append('data', audioBlob, 'audio.mp3');

  fetch(`${HOST}/api/v1/transcriptions`, {
    method: 'POST',
    body: formData
  })
    .then(response => response.json())
    .then(transcriptionData => {
      const transcription = transcriptionData.transcription;
      updateLastMessage(transcription);

      // Envia a transcrição e a imagem para a API de conversa
      sendMessageToAssistant(transcription);
    })
    .catch(error => {
      console.error('Erro na transcrição:', error);
      updateLastMessage('Desculpe, não consegui entender.');
    });
}

// Função para enviar a mensagem para o assistente
function sendMessageToAssistant(userMessage) {
  const messageContent = [{ type: 'text', text: userMessage }];

  if (uploadedImage) {
    const reader = new FileReader();
    reader.onloadend = function () {
      const base64Image = reader.result.split(',')[1];
      messageContent.push({
        type: 'image_url',
        image_url: {
          url: `data:image/png;base64,${base64Image}`,
          detail: 'high'
        }
      });

      sendChatRequest(messageContent);
    };
    reader.readAsDataURL(uploadedImage);
  } else {
    sendChatRequest(messageContent);
  }
}

// Função para enviar a requisição de chat
function sendChatRequest(content) {
  const data = {
    messages: [
      {
        role: 'user',
        content: content
      }
    ]
  };

  // Exibe indicador de que a assistente está digitando
  showTypingIndicator();

  fetch(`${HOST}/api/v1/screen-info`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  })
    .then(response => response.json())
    .then(chatData => {
      const assistantResponse = chatData.choices[0].message.content;

      // Converte a resposta em áudio e, ao mesmo tempo, prepara a exibição da mensagem
      getAudioResponse(assistantResponse)
        .then(audioBase64 => {
          // Remove o indicador de digitação
          removeTypingIndicator();

          // Exibe a mensagem com markdown renderizado
          addMessageToChat('', 'assistant-message', assistantResponse);

          // Inicia a reprodução do áudio imediatamente
          playAudioFromBase64(audioBase64);
        })
        .catch(error => {
          console.error('Erro no text-to-speech:', error);
          removeTypingIndicator();
          addMessageToChat('Desculpe, houve um erro ao processar sua pergunta.', 'assistant-message');
        });
    })
    .catch(error => {
      console.error('Erro na conversa:', error);
      removeTypingIndicator();
      addMessageToChat('Desculpe, houve um erro ao processar sua pergunta.', 'assistant-message');
    });
}

// Função para obter o áudio da resposta
function getAudioResponse(text) {
  return fetch(`${HOST}/api/v1/text-to-speech`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: text })
  })
    .then(response => response.json())
    .then(audioData => {
      return audioData.audio;
    });
}

// Função para reproduzir o áudio a partir de uma string Base64
function playAudioFromBase64(base64Audio) {
  const audio = new Audio(`data:audio/mp3;base64,${base64Audio}`);
  audio.play();
}

// Função para adicionar mensagens ao chat
function addMessageToChat(messageContent, messageClass, fullText = '') {
  const messageElement = document.createElement('div');
  messageElement.className = `message ${messageClass}`;
  
  if (fullText) {
    // Parse o markdown para HTML
    const rawHtml = marked.parse(fullText);
    // Sanitiza o HTML
    const sanitizedHtml = DOMPurify.sanitize(rawHtml);

    messageElement.innerHTML = sanitizedHtml;
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  } else {
    messageElement.innerHTML = `<p>${messageContent}</p>`;
    chatWindow.appendChild(messageElement);
    chatWindow.scrollTop = chatWindow.scrollHeight;
  }
}

// Função para atualizar a última mensagem (usada após transcrição)
function updateLastMessage(newText) {
  const lastMessage = chatWindow.lastElementChild;
  if (lastMessage) {
    lastMessage.innerHTML = `<p>${newText}</p>`;
  }
}

// Função para mostrar o indicador de digitação
function showTypingIndicator() {
  const typingIndicator = document.createElement('div');
  typingIndicator.id = 'typing-indicator';
  typingIndicator.className = 'message assistant-message';
  typingIndicator.innerHTML = '<p>Assistente está digitando...</p>';
  chatWindow.appendChild(typingIndicator);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// Função para remover o indicador de digitação
function removeTypingIndicator() {
  const typingIndicator = document.getElementById('typing-indicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}
